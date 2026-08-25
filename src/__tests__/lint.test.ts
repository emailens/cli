import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMAIL_CLIENTS, MAX_WARNING_LOCATIONS } from "@emailens/engine";
import pkg from "../../package.json" with { type: "json" };
import { meta } from "../meta.js";
import { positionsApply } from "../utils.js";

/**
 * End-to-end tests for `emailens lint`.
 *
 * The exit code IS the product here: every CI pipeline using this CLI branches
 * on it. A lint that wrongly exits 0 does not fail loudly, it fails silently,
 * the build goes green and the broken email ships. Nothing protected that
 * contract before these tests, so they run the real binary and assert on the
 * real exit status rather than unit-testing around it.
 */

const ENTRY = join(import.meta.dir, "..", "index.ts");

let dir: string;
let clean: string;
let warns: string;
let errors: string;
let located: string;
let locatedSource: string;

async function cli(...args: string[]) {
  // `bun ENTRY`, not `bun run ENTRY`: `bun run` swallows flags it recognises as
  // its own (--version among them) before the script ever sees them.
  // A pipe is not a TTY, so colour ought to be off, but chalk turns it back
  // on when it sees `CI`, which every runner sets and no developer machine
  // does. That put ANSI codes between `border-radius` and ` (2:15)` and failed
  // three assertions on CI alone. These tests are about what the CLI says, not
  // how it paints it.
  const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
  const proc = Bun.spawn(["bun", ENTRY, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env,
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

  // position: absolute is unsupported in most clients; warnings, never errors.
  warns = join(dir, "warns.html");
  writeFileSync(
    warns,
    `${HEAD}
    <p style="position:absolute;color:#1a1a1a;background:#ffffff;font-size:14px">Your order 1234 has shipped.</p>
    <img src="https://example.com/a.png" alt="Package" width="40" height="40">
    <a href="https://example.com/track" style="color:#1a1a1a">Track your order</a>
    ${FOOT}`,
  );

  // Multi-line on purpose: the point of this fixture is that every issue in it
  // has a line and column a human could go to.
  locatedSource = [
    /* 1 */ '<html lang="en">',
    /* 2 */ "<head>",
    /* 3 */ "  <style>",
    /* 4 */ "    .card { border-radius: 8px; }",
    /* 5 */ "  </style>",
    /* 6 */ '  <meta charset="utf-8"><title>Order shipped</title>',
    /* 7 */ "</head>",
    /* 8 */ "<body>",
    /* 9 */ '  <a href="http://example.com/track">Track your order</a>',
    /* 10 */ '  <img src="https://example.com/a.png">',
    /* 11 */ "  <p>Hello {{first_name}}</p>",
    /* 12 */ FOOT,
  ].join("\n");
  located = join(dir, "located.html");
  writeFileSync(located, locatedSource);

  // An empty mailto: is an error; the link is simply broken.
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

describe("lint: exit codes (the CI contract)", () => {
  test("errors exit 1", async () => {
    const { exitCode } = await cli("lint", errors, "--json");
    expect(exitCode).toBe(1);
  });

  test("warnings alone exit 0: a warning is not a build break", async () => {
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

describe("lint: JSON contract (what CI parses)", () => {
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

describe("lint: failure paths report rather than crash", () => {
  test("a missing file exits 1 with a message, not a stack trace", async () => {
    const { exitCode, stderr } = await cli("lint", join(dir, "nope.html"));

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/nope\.html/);
    expect(stderr).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no raw stack
  });

  test("an unknown --skip value is rejected, not silently ignored", async () => {
    // Silently ignoring it would mean the user believes a check ran when it did
    // not, the same class of failure as a lint that always exits 0.
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
    // Asserted against meta rather than the binary: testing it through the
    // process means racing citty's process.exit() against the stdout flush.
    expect(meta.version).toBe(pkg.version);
  });

  test("the client count in the description is not hardcoded", () => {
    // It claimed 12 while the engine shipped 15.
    expect(meta.description).toContain(String(EMAIL_CLIENTS.length));
  });
});

describe("lint: source positions", () => {
  /** Derive line/column from an offset independently of the engine. */
  function lineColOf(source: string, offset: number) {
    const prefix = source.slice(0, offset);
    return { line: prefix.split("\n").length, column: offset - (prefix.lastIndexOf("\n") + 1) + 1 };
  }

  test("--json carries a loc that points at the offending source", async () => {
    const { stdout } = await cli("lint", located, "--json");
    const { issues } = JSON.parse(stdout).files[0];

    const link = issues.find((i: { rule: string }) => i.rule === "insecure-link");
    expect(link.loc).toBeDefined();
    expect(link.loc.line).toBe(9);
    expect(locatedSource.slice(link.loc.offset, link.loc.offset + link.loc.length)).toBe(
      'href="http://example.com/track"',
    );

    const radius = issues.find((i: { rule: string }) => i.rule === "border-radius");
    expect(radius.loc.line).toBe(4);
    expect(locatedSource.slice(radius.loc.offset, radius.loc.offset + radius.loc.length)).toBe(
      "border-radius: 8px",
    );

    const variable = issues.find((i: { category: string }) => i.category === "templateVars");
    expect(variable.loc.line).toBe(11);
  });

  test("every loc in the report is inside the file and self-consistent", async () => {
    const { stdout } = await cli("lint", located, "--json");
    const { issues } = JSON.parse(stdout).files[0];

    const located_ = issues.filter((i: { loc?: unknown }) => i.loc);
    expect(located_.length).toBeGreaterThan(3);

    for (const { loc } of located_) {
      expect(loc.offset).toBeGreaterThanOrEqual(0);
      expect(loc.offset + loc.length).toBeLessThanOrEqual(locatedSource.length);
      expect(lineColOf(locatedSource, loc.offset)).toEqual({ line: loc.line, column: loc.column });
    }
  });

  test("the terminal output shows line:col next to each located issue", async () => {
    const { stdout } = await cli("lint", located);

    expect(stdout).toMatch(/9:6\s+links\s+insecure-link/);
    expect(stdout).toMatch(/4:13\s+\S*outlook\S*\s+border-radius/);
  });

  test("document-level findings stay position-free rather than guessing", async () => {
    const { stdout } = await cli("lint", located, "--json");
    const { issues } = JSON.parse(stdout).files[0];

    // Nothing in the document points at "the whole document" but the spam and
    // inbox-preview checks, and they must not invent a line for it.
    const documentLevel = issues.filter((i: { category: string }) =>
      ["spam", "inboxPreview", "size"].includes(i.category),
    );
    expect(documentLevel.length).toBeGreaterThan(0); // else this test proves nothing
    for (const issue of documentLevel) expect(issue.loc).toBeUndefined();
  });

  test("--json lists every place a property breaks, not just the first", async () => {
    const repeated = join(dir, "repeated.html");
    writeFileSync(
      repeated,
      ["<html lang=\"en\"><head><meta charset=\"utf-8\"><title>T</title></head><body>",
       '  <div style="border-radius:8px">a</div>',
       '  <div style="border-radius:8px">b</div>',
       '  <div style="border-radius:8px">c</div>',
       "</body></html>"].join("\n"),
    );
    const { stdout } = await cli("lint", repeated, "--json");
    const issue = JSON.parse(stdout).files[0].issues.find(
      (i: { rule: string }) => i.rule === "border-radius",
    );

    expect(issue.locs).toHaveLength(3);
    expect(issue.locs.map((l: { line: number }) => l.line)).toEqual([2, 3, 4]);
    expect(issue.loc).toEqual(issue.locs[0]);
    expect(issue.locsTruncated).toBeUndefined();
  });

  test("the occurrence list stays capped when groups are unioned", async () => {
    // Each engine warning is capped at 100, but lint unions several selector
    // groups into one issue, without a cap here a generated email produces an
    // unbounded list, and a consumer can't tell it is partial.
    const many = join(dir, "many.html");
    const rows: string[] = [];
    for (let i = 0; i < 60; i++) {
      rows.push('  <div style="border-radius:4px">a</div>');
      rows.push('  <span style="border-radius:4px">b</span>');
      rows.push('  <p style="border-radius:4px">c</p>');
    }
    writeFileSync(
      many,
      `<html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>\n${rows.join("\n")}\n</body></html>`,
    );

    const { stdout } = await cli("lint", many, "--json");
    const issue = JSON.parse(stdout).files[0].issues.find(
      (i: { rule: string }) => i.rule === "border-radius",
    );

    expect(issue.locs).toHaveLength(MAX_WARNING_LOCATIONS);
    expect(issue.locsTruncated).toBe(true);
  });

  test("positions are reported for HTML only", () => {
    // Compiled formats are analyzed as generated HTML, whose lines have nothing
    // to do with the .tsx/.mjml file the user wrote. A wrong line that looks
    // authoritative is worse than none.
    expect(positionsApply("html")).toBe(true);
    expect(positionsApply("jsx")).toBe(false);
    expect(positionsApply("mjml")).toBe(false);
    expect(positionsApply("maizzle")).toBe(false);
  });
});

describe("lint: .emailensrc", () => {
  /**
   * The file the editor extension already reads. A rule demoted there that
   * still fails the build is the worst of both: the Problems panel says it
   * does not matter and CI says it does.
   *
   * The exit code is what these assert, because that is what a pipeline
   * branches on. The config is found by walking up from the working
   * directory, so each case gets its own directory and runs the CLI in it.
   */
  async function lintIn(cwd: string, ...args: string[]) {
    const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
    const proc = Bun.spawn(["bun", ENTRY, "lint", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env,
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { exitCode: await proc.exited, stdout, stderr };
  }

  /** A directory holding one email and, optionally, a config beside it. */
  function project(config?: string): string {
    const at = mkdtempSync(join(tmpdir(), "emailens-rc-"));
    writeFileSync(
      join(at, "email.html"),
      `${HEAD}<a href="http://example.com/track">Track</a>${FOOT}`,
    );
    if (config !== undefined) writeFileSync(join(at, ".emailensrc"), config);
    return at;
  }

  test("without a config the insecure link is reported", async () => {
    const at = project();
    const { stdout } = await lintIn(at, "email.html");
    expect(stdout).toContain("insecure-link");
    rmSync(at, { recursive: true, force: true });
  });

  test("promoting a rule to error changes the exit code", async () => {
    // The whole point: `emailens.rules` in the editor and `.emailensrc` in CI
    // are the same decision, and this is where it becomes a failing build.
    const before = project();
    expect((await lintIn(before, "email.html")).exitCode).not.toBe(1);
    rmSync(before, { recursive: true, force: true });

    const at = project('{"rules":{"insecure-link":"error"}}');
    const { exitCode, stdout } = await lintIn(at, "email.html");
    expect(stdout).toContain("insecure-link");
    expect(exitCode).toBe(1);
    rmSync(at, { recursive: true, force: true });
  });

  test("off removes the finding entirely", async () => {
    const at = project('{"rules":{"insecure-link":"off"}}');
    const { stdout } = await lintIn(at, "email.html");
    expect(stdout).not.toContain("insecure-link");
    rmSync(at, { recursive: true, force: true });
  });

  test("a misspelled severity is named on stderr rather than ignored", async () => {
    const at = project('{"rules":{"insecure-link":"eror"}}');
    const { stdout, stderr } = await lintIn(at, "email.html");
    expect(stderr).toContain("insecure-link");
    expect(stderr).toMatch(/"error", "warning", "info" or "off"/);
    // And the rule still fires, because nothing valid asked it not to.
    expect(stdout).toContain("insecure-link");
    rmSync(at, { recursive: true, force: true });
  });

  test("skip in the file works, and --skip on the command line wins", async () => {
    const at = project('{"skip":["links"]}');
    expect((await lintIn(at, "email.html")).stdout).not.toContain("insecure-link");
    // A flag is an explicit choice for this invocation; the file is ambient.
    // Skipping something else means links are checked again.
    expect((await lintIn(at, "email.html", "--skip", "spam")).stdout).toContain("insecure-link");
    rmSync(at, { recursive: true, force: true });
  });

  test("a malformed config lints without it rather than failing", async () => {
    const at = project("{ not json");
    const { stdout, exitCode } = await lintIn(at, "email.html");
    expect(stdout).toContain("insecure-link");
    expect(exitCode).not.toBe(2);
    rmSync(at, { recursive: true, force: true });
  });

  test("JSON output stays parseable when the config has complaints", async () => {
    // The warnings go to stderr for exactly this reason: a pipeline doing
    // `emailens lint --json | jq` must not be handed prose on stdout.
    const at = project('{"rules":{"insecure-link":"eror"}}');
    const { stdout, stderr } = await lintIn(at, "email.html", "--json");
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(stderr).toBe("");
    rmSync(at, { recursive: true, force: true });
  });
});
