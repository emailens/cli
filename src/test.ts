import { auditEmail, type AuditOptions } from "@emailens/engine";
import { flattenToLintIssues, type LintIssue } from "./commands/lint.js";
import { applySeverities, loadProjectConfig } from "./project-config.js";

export type { LintIssue };

export interface ExpectEmailOptions {
  /** Fail on warnings too, like `lint --fail-on-warning`. */
  failOnWarning?: boolean;
  /** Checks to skip, the same names as `lint --skip`. */
  skip?: string[];
  framework?: AuditOptions["framework"];
}

/**
 * The `lint` check as a test assertion: throws, listing every finding that
 * fails, unless the email passes. Plain throw, so it works in Vitest, Jest and
 * bun:test alike. Reads the project's `.emailensrc` like the CLI, so a test and
 * the CI step cannot disagree about the same email. Returns the findings.
 *
 *   expectEmailToPass(await render(<Welcome />));
 */
export function expectEmailToPass(html: string, options: ExpectEmailOptions = {}): LintIssue[] {
  const project = loadProjectConfig();
  const skip = options.skip ?? project?.skip ?? [];
  const report = auditEmail(html, {
    framework: options.framework,
    skip: skip as AuditOptions["skip"],
    positions: true,
  });
  const issues = applySeverities(flattenToLintIssues(report, skip), project?.rules);
  const failing = issues.filter(
    (i) => i.severity === "error" || (options.failOnWarning && i.severity === "warning"),
  );
  if (failing.length > 0) {
    const lines = failing.map(
      (i) => `  ${i.severity.padEnd(7)} ${i.loc ? `${i.loc.line}:${i.loc.column} ` : ""}${i.category} ${i.rule}: ${i.message}`,
    );
    throw new Error(`Email fails emailens lint (${failing.length}):\n${lines.join("\n")}`);
  }
  return issues;
}
