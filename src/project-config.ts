import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

/**
 * `.emailensrc`, shared with the editor extension.
 *
 * A severity policy is a team decision, and a team decision that lives in one
 * person's editor settings is one CI disagrees with. The extension has read
 * this file since it shipped; the CLI reading the same keys is what makes the
 * two agree — a rule demoted in the editor and still failing the build is the
 * worst of both.
 *
 * Precedence here is the other way round from the editor's, deliberately. A
 * command-line flag is an explicit choice for one invocation and wins; an
 * editor setting is ambient, so the repo's file wins there.
 */

/** What a rule may be turned into. `off` means not reported at all. */
export type RuleSeverity = "error" | "warning" | "info" | "off";
export type RuleSeverities = Record<string, RuleSeverity>;

const SEVERITIES: readonly string[] = ["error", "warning", "info", "off"];

export interface ProjectConfig {
  skip?: string[];
  rules?: RuleSeverities;
  /** Where it was read from, for error messages. */
  source?: string;
  /** Entries that were not usable, named rather than dropped in silence. */
  invalid: string[];
}

/**
 * Read a `rules` map, keeping what is usable and naming what is not.
 *
 * A misspelled severity is silently nothing otherwise, and a rule someone
 * believes is switched off but is not is worse than no setting at all.
 */
export function parseRules(value: unknown): { rules: RuleSeverities; invalid: string[] } {
  const rules: RuleSeverities = {};
  const invalid: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { rules, invalid };

  for (const [rule, severity] of Object.entries(value as Record<string, unknown>)) {
    if (typeof severity === "string" && SEVERITIES.includes(severity)) {
      rules[rule] = severity as RuleSeverity;
    } else {
      invalid.push(`${rule}: ${JSON.stringify(severity)}`);
    }
  }
  return { rules, invalid };
}

/** Parse a config body that has already been read off disk. */
export function parseProjectConfig(
  source: string,
  from: "emailensrc" | "package.json",
): ProjectConfig | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    // A malformed file is a reason to lint without it, not a reason to stop.
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;

  const body = from === "package.json" ? (parsed as Record<string, unknown>).emailens : parsed;
  if (!body || typeof body !== "object") return undefined;

  const config: ProjectConfig = { invalid: [] };
  const skip = (body as Record<string, unknown>).skip;
  if (Array.isArray(skip) && skip.every((s) => typeof s === "string")) config.skip = skip;

  const { rules, invalid } = parseRules((body as Record<string, unknown>).rules);
  if (Object.keys(rules).length) config.rules = rules;
  config.invalid = invalid;

  return config.skip || config.rules || invalid.length ? config : undefined;
}

/**
 * Find and read the nearest config, walking up from `from`.
 *
 * Upward, because `emailens lint emails/*.html` is usually run from the repo
 * root while the file being linted is not, and the config belongs to the
 * project rather than to the directory the shell happens to be in.
 */
export function loadProjectConfig(from: string = process.cwd()): ProjectConfig | undefined {
  const root = parse(from).root;
  for (let dir = from; ; dir = dirname(dir)) {
    for (const [name, kind] of [
      [".emailensrc", "emailensrc"],
      ["package.json", "package.json"],
    ] as const) {
      const path = join(dir, name);
      if (!existsSync(path)) continue;
      let body: string;
      try {
        body = readFileSync(path, "utf-8");
      } catch {
        continue;
      }
      const config = parseProjectConfig(body, kind);
      if (config) return { ...config, source: path };
    }
    if (dir === root) return undefined;
  }
}

/** Apply per-rule severities. `off` drops the issue entirely. */
export function applySeverities<T extends { rule: string; severity: "error" | "warning" | "info" }>(
  issues: T[],
  rules?: RuleSeverities,
): T[] {
  if (!rules || !Object.keys(rules).length) return issues;
  const out: T[] = [];
  for (const issue of issues) {
    const severity = rules[issue.rule];
    if (severity === "off") continue;
    out.push(severity ? { ...issue, severity } : issue);
  }
  return out;
}
