import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * End-to-end tests for `emailens analyze`, focused on source positions.
 *
 * A position is only worth printing if it points at the thing that caused the
 * warning, so these assert on the source text at the reported offset rather
 * than on the numbers alone.
 */

const ENTRY = join(import.meta.dir, "..", "index.ts");

async function cli(...args: string[]) {
  // A pipe is not a TTY, so colour ought to be off, but chalk turns it back
  // on when it sees `CI`, which every runner sets and no developer machine
  // does. That put ANSI codes between `border-radius` and ` (2:15)` and failed
  // three assertions on CI alone. These tests are about what the CLI says, not
  // how it paints it.
  const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
  const proc = Bun.spawn(["bun", ENTRY, ...args], { stdout: "pipe", stderr: "pipe", env });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode: await proc.exited, stdout, stderr };
}

let dir: string;
let file: string;
let source: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "emailens-analyze-"));
  source = [
    /* 1 */ '<html lang="en">',
    /* 2 */ '<head><meta charset="utf-8"><title>Sale</title></head>',
    /* 3 */ "<body>",
    /* 4 */ '  <div style="border-radius:8px">a</div>',
    /* 5 */ '  <p>Tom &amp; Jerry</p>',
    /* 6 */ '  <div style="border-radius:8px">b</div>',
    /* 7 */ "</body>",
    /* 8 */ "</html>",
  ].join("\n");
  file = join(dir, "sale.html");
  writeFileSync(file, source);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("analyze: source positions", () => {
  test("--json reports every place the property breaks", async () => {
    const { stdout } = await cli("analyze", file, "-c", "outlook-windows", "--json");
    const warning = JSON.parse(stdout).warnings.find(
      (w: { property: string }) => w.property === "border-radius",
    );

    expect(warning.loc).toBeDefined();
    expect(warning.locs).toHaveLength(2);
    expect(warning.locs.map((l: { line: number }) => l.line)).toEqual([4, 6]);
    for (const loc of warning.locs) {
      // The declaration, not the attribute around it: engine 0.10.3 narrowed
      // this, so `emailens analyze` now points at the characters to change.
      expect(source.slice(loc.offset, loc.offset + loc.length)).toBe("border-radius:8px");
    }
    expect(warning.loc).toEqual(warning.locs[0]);
  });

  test("a character reference before an offender does not shift its position", async () => {
    // `&amp;` on line 5 decodes shorter than its source; the offender after it
    // must still resolve to its real offset.
    const { stdout } = await cli("analyze", file, "-c", "outlook-windows", "--json");
    const warning = JSON.parse(stdout).warnings.find(
      (w: { property: string }) => w.property === "border-radius",
    );
    const second = warning.locs[1];
    expect(second.offset).toBe(source.lastIndexOf("border-radius:8px"));
  });

  test("the terminal output says where, and how many others", async () => {
    const { stdout } = await cli("analyze", file, "-c", "outlook-windows");
    expect(stdout).toMatch(/border-radius \(4:15 \+1 more\)/);
  });

  test("a single occurrence prints a position with no count", async () => {
    const one = join(dir, "one.html");
    writeFileSync(one, '<html lang="en"><body>\n  <div style="border-radius:8px">a</div>\n</body></html>');
    const { stdout } = await cli("analyze", one, "-c", "outlook-windows");
    expect(stdout).toMatch(/border-radius \(2:15\)/);
    expect(stdout).not.toMatch(/more\)/);
  });
});
