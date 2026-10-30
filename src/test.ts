import { auditEmail, type AuditOptions } from "@emailens/engine";
import { flattenToLintIssues } from "./commands/lint.js";
import { applySeverities, loadProjectConfig } from "./project-config.js";

// The engine is bundled into the CLI, not installed beside it, so the public
// types are restated here rather than imported from it. The assignment in
// expectEmailToPass keeps them in step with the engine's.

/** Where a finding sits in the source. */
export interface SourceLocation {
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  endLine: number;
  endColumn: number;
  /** 0-based character offset. */
  offset: number;
  length: number;
}

export interface LintIssue {
  severity: "error" | "warning" | "info";
  category: string;
  rule: string;
  message: string;
  detail?: string;
  /** HTML sources only. */
  loc?: SourceLocation;
  /** Every place a CSS property breaks, in document order. */
  locs?: SourceLocation[];
  /** `locs` is capped and does not list every occurrence. */
  locsTruncated?: boolean;
}

export interface ExpectEmailOptions {
  /** Fail on warnings too, like `lint --fail-on-warning`. */
  failOnWarning?: boolean;
  /** Checks to skip, the same names as `lint --skip`. */
  skip?: string[];
  /** The source the HTML was compiled from, for framework-aware notes. */
  framework?: "jsx" | "mjml" | "maizzle";
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
  const issues: LintIssue[] = applySeverities(flattenToLintIssues(report, skip), project?.rules);
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
