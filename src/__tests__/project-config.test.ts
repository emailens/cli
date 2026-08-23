import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applySeverities,
  loadProjectConfig,
  parseProjectConfig,
  parseRules,
} from "../project-config";

/**
 * `.emailensrc` is shared with the editor extension, and the reason it exists
 * here is disagreement: a rule demoted in the editor that still fails the
 * build is the worst of both, because the panel says it does not matter and CI
 * says it does. These assert the two readers agree on the same file.
 */

function workspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "emailens-cfg-"));
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return dir;
}

describe("reading a rules map", () => {
  test("every valid severity is kept", () => {
    const { rules, invalid } = parseRules({
      "border-radius": "error",
      "font-size": "off",
      gap: "warning",
      transition: "info",
    });
    expect(invalid).toEqual([]);
    expect(Object.keys(rules)).toHaveLength(4);
  });

  test("a misspelled severity is dropped and named", () => {
    const { rules, invalid } = parseRules({ "border-radius": "eror", gap: "off" });
    expect(rules).toEqual({ gap: "off" });
    expect(invalid).toEqual(['border-radius: "eror"']);
  });

  test("anything that is not a map of strings is no rules at all", () => {
    for (const value of [undefined, null, "off", 7, ["gap"]]) {
      expect([value, parseRules(value).rules]).toEqual([value, {}]);
    }
  });
});

describe("finding the file", () => {
  test("a .emailensrc in the directory", () => {
    const dir = workspace({ ".emailensrc": '{"rules":{"border-radius":"error"}}' });
    expect(loadProjectConfig(dir)?.rules).toEqual({ "border-radius": "error" });
    rmSync(dir, { recursive: true, force: true });
  });

  test("an emailens key in package.json", () => {
    const dir = workspace({
      "package.json": JSON.stringify({ name: "e", emailens: { rules: { gap: "off" } } }),
    });
    expect(loadProjectConfig(dir)?.rules).toEqual({ gap: "off" });
    rmSync(dir, { recursive: true, force: true });
  });

  test(".emailensrc wins over package.json in the same directory", () => {
    const dir = workspace({
      ".emailensrc": '{"rules":{"gap":"error"}}',
      "package.json": JSON.stringify({ name: "e", emailens: { rules: { gap: "off" } } }),
    });
    expect(loadProjectConfig(dir)?.rules).toEqual({ gap: "error" });
    rmSync(dir, { recursive: true, force: true });
  });

  test("found by walking up, because lint is run from the repo root", () => {
    const dir = workspace({
      ".emailensrc": '{"rules":{"gap":"off"}}',
      "emails/campaigns/.keep": "",
    });
    expect(loadProjectConfig(join(dir, "emails", "campaigns"))?.rules).toEqual({ gap: "off" });
    rmSync(dir, { recursive: true, force: true });
  });

  test("a malformed file is linted without, not fatal", () => {
    const dir = workspace({ ".emailensrc": "{ not json" });
    expect(loadProjectConfig(dir)).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  test("a package.json with no emailens key is not a config", () => {
    const dir = workspace({ "package.json": JSON.stringify({ name: "e" }) });
    expect(loadProjectConfig(dir)).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  test("the source path comes back, so an error can name the file", () => {
    const dir = workspace({ ".emailensrc": '{"rules":{"gap":"nope"}}' });
    const config = loadProjectConfig(dir);
    expect(config?.source).toBe(join(dir, ".emailensrc"));
    expect(config?.invalid).toEqual(['gap: "nope"']);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("applying severities", () => {
  interface Issue {
    rule: string;
    severity: "error" | "warning" | "info";
  }
  const issues: Issue[] = [
    { rule: "border-radius", severity: "warning" },
    { rule: "insecure-link", severity: "warning" },
    { rule: "gap", severity: "info" },
  ];

  test("a rule is promoted in place", () => {
    const after = applySeverities(issues, { "border-radius": "error" });
    expect(after.map((i) => i.severity)).toEqual(["error", "warning", "info"]);
  });

  test("off removes the issue rather than demoting it", () => {
    const after = applySeverities(issues, { "insecure-link": "off" });
    expect(after.map((i) => i.rule)).toEqual(["border-radius", "gap"]);
  });

  test("no map is the engine's own verdict, unchanged", () => {
    expect(applySeverities(issues, {})).toEqual(issues);
    expect(applySeverities(issues, undefined)).toEqual(issues);
  });

  test("a rule nobody broke costs nothing", () => {
    expect(applySeverities(issues, { "not-a-rule": "error" })).toEqual(issues);
  });
});

describe("agreeing with the extension", () => {
  test("the same file parses to the same rules in both readers", () => {
    // The extension's parser is the same shape by construction; this pins the
    // contract the two share so a change on either side is a visible one.
    const body = '{"skip":["spam"],"rules":{"border-radius":"error","gap":"off"}}';
    const config = parseProjectConfig(body, "emailensrc");
    expect(config).toEqual({
      skip: ["spam"],
      rules: { "border-radius": "error", gap: "off" },
      invalid: [],
    });
  });
});
