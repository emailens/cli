import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMAIL_CLIENTS } from "@emailens/engine";
import pkg from "../../package.json" with { type: "json" };
import { meta } from "../meta.js";

/**
 * End-to-end tests for `emailens lint`.
 *
 * The exit code IS the product here: every CI pipeline using this CLI branches
 * on it. A lint that wrongly exits 0 does not fail loudly, it fails silently —
 * the build goes green and the broken email ships. Nothing protected that
 * contract before these tests, so they run the real binary and assert on the
 * real exit status rather than unit-testing around it.
 */

const ENTRY = join(import.meta.dir, "..", "index.ts");

let dir: string;
let clean: string;
let warns: string;
let errors: string;

async function cli(...args: string[]) {
  // `bun ENTRY`, not `bun run ENTRY`: `bun run` swallows flags it recognises as
  // its own (--version among them) before the script ever sees them.
  const proc = Bun.spawn(["bun", ENTRY, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

const HEAD = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Order shipped</title></head><body>`;
const FOOT = `<a href="https://example.com/unsubscribe" style="color:#1a1a1a">Unsubscribe</a>
  <address>1 Main St, Springfield</address></body></html>`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "emailens-cli-"));

  clean = join(dir, "clean.html");
  writeFileSync(
    clean,
    `${HEAD}
    <p style="color:#1a1a1a;background:#ffffff;font-size:14px">Your order 1234 has shipped. Tracking is below.</p>
    <img src="https://example.com/a.png" alt="Package" width="40" height="40">
    <a href="https://example.com/track" style="color:#1a1a1a">Track your order</a>
    ${FOOT}`,
  );

  // position: absolute is unsupported in most clients — warnings, never errors.
  warns = join(dir, "warns.html");
  writeFileSync(
    warns,
    `${HEAD}
    <p style="position:absolute;color:#1a1a1a;background:#ffffff;font-size:14px">Your order 1234 has shipped.</p>
    <img src="https://example.com/a.png" alt="Package" width="40" height="40">
    <a href="https://example.com/track" style="color:#1a1a1a">Track your order</a>
    ${FOOT}`,
  );

  // An empty mailto: is an error — the link is simply broken.
  errors = join(dir, "errors.html");
  writeFileSync(
    errors,
    `${HEAD}
    <p style="color:#1a1a1a;background:#ffffff;font-size:14px">Your order 1234 has shipped.</p>
    <a href="mailto:" style="color:#1a1a1a">Email us</a>
    ${FOOT}`,
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("lint — exit codes (the CI contract)", () => {
  test("errors exit 1", async () => {
    const { exitCode } = await cli("lint", errors, "--json");
    expect(exitCode).toBe(1);
  });

  test("warnings alone exit 0 — a warning is not a build break", async () => {
    const { exitCode, stdout } = await cli("lint", warns, "--json");
    const report = JSON.parse(stdout);

    expect(report.totalErrors).toBe(0);
    expect(report.totalWarnings).toBeGreaterThan(0);
    expect(exitCode).toBe(0);
  });

  test("--failOnWarning turns those same warnings into exit 2", async () => {
    const { exitCode } = await cli("lint", warns, "--json", "--failOnWarning");
    expect(exitCode).toBe(2);
  });

  test("--maxWarnings 0 fails when any warning exists", async () => {
    const { exitCode } = await cli("lint", warns, "--json", "--maxWarnings", "0");
    expect(exitCode).toBe(2);
  });

  test("--maxWarnings above the count passes", async () => {
    const { exitCode } = await cli("lint", warns, "--json", "--maxWarnings", "999");
    expect(exitCode).toBe(0);
  });

  test("--maxWarnings is a ceiling, not a floor: exactly N warnings passes", async () => {
    const { stdout } = await cli("lint", warns, "--json");
    const n = JSON.parse(stdout).totalWarnings;

    const at = await cli("lint", warns, "--json", "--maxWarnings", String(n));
    const under = await cli("lint", warns, "--json", "--maxWarnings", String(n - 1));

    expect(at.exitCode).toBe(0);
    expect(under.exitCode).toBe(2);
  });

  test("a clean email exits 0 even under --failOnWarning", async () => {
    const { exitCode, stdout } = await cli("lint", clean, "--json", "--failOnWarning");
    const report = JSON.parse(stdout);

    expect(report.totalErrors).toBe(0);
    expect(report.totalWarnings).toBe(0);
    expect(exitCode).toBe(0);
  });
});

describe("lint — JSON contract (what CI parses)", () => {
  test("--json emits parseable JSON with the documented shape", async () => {
    const { stdout } = await cli("lint", errors, "--json");
    const report = JSON.parse(stdout);

    expect(Array.isArray(report.files)).toBe(true);
    expect(report.files).toHaveLength(1);
    expect(typeof report.totalErrors).toBe("number");
    expect(typeof report.totalWarnings).toBe("number");

    const file = report.files[0];
    expect(typeof file.file).toBe("string");
    expect(Array.isArray(file.issues)).toBe(true);
    expect(file.errors + file.warnings).toBeLessThanOrEqual(file.issues.length);

    const issue = file.issues[0];
    expect(["error", "warning", "info"]).toContain(issue.severity);
    expect(typeof issue.rule).toBe("string");
    expect(typeof issue.message).toBe("string");
  });

  test("errors sort ahead of warnings, so the first issue is the worst", async () => {
    const { stdout } = await cli("lint", errors, "--json");
    const { issues } = JSON.parse(stdout).files[0];
    const rank = { error: 0, warning: 1, info: 2 } as const;

    const ranks = issues.map((i: { severity: keyof typeof rank }) => rank[i.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test("--skip removes that category from the output", async () => {
    const withLinks = JSON.parse((await cli("lint", errors, "--json")).stdout);
    const skipped = JSON.parse((await cli("lint", errors, "--json", "--skip", "links")).stdout);

    const cats = (r: { files: { issues: { category: string }[] }[] }) =>
      r.files[0].issues.map((i) => i.category);

    expect(cats(withLinks)).toContain("links");
    expect(cats(skipped)).not.toContain("links");
  });
});

describe("lint — failure paths report rather than crash", () => {
  test("a missing file exits 1 with a message, not a stack trace", async () => {
    const { exitCode, stderr } = await cli("lint", join(dir, "nope.html"));

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/nope\.html/);
    expect(stderr).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no raw stack
  });

  test("an unknown --skip value is rejected, not silently ignored", async () => {
    // Silently ignoring it would mean the user believes a check ran when it did
    // not — the same class of failure as a lint that always exits 0.
    const { exitCode, stderr } = await cli("lint", clean, "--skip", "spelling");

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/spelling/);
  });

  test("a non-numeric --maxWarnings is rejected", async () => {
    const { exitCode, stderr } = await cli("lint", clean, "--maxWarnings", "lots");

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/number/i);
  });
});

describe("cli metadata", () => {
  test("the reported version matches package.json", () => {
    // It did not: index.ts hardcoded 0.4.0 while the package was 0.3.4, so
    // anyone filing a bug would have quoted a version that never shipped.
    // Asserted against meta rather than the binary — testing it through the
    // process means racing citty's process.exit() against the stdout flush.
    expect(meta.version).toBe(pkg.version);
  });

  test("the client count in the description is not hardcoded", () => {
    // It claimed 12 while the engine shipped 15.
    expect(meta.description).toContain(String(EMAIL_CLIENTS.length));
  });
});
