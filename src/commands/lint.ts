import { defineCommand } from "citty";
import pc from "picocolors";
import { readInput, resolveFormat, toFramework } from "../utils.js";
import { compile } from "@emailens/engine/compile";
import {
  auditEmail,
  CompileError,
  type AuditReport,
} from "@emailens/engine";
import { readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";

interface LintIssue {
  severity: "error" | "warning" | "info";
  category: string;
  rule: string;
  message: string;
  detail?: string;
}

interface LintFileResult {
  file: string;
  issues: LintIssue[];
  errors: number;
  warnings: number;
}

const VALID_SKIPS = new Set([
  "spam", "links", "accessibility", "images",
  "compatibility", "inboxPreview", "size", "templateVariables",
]);

export default defineCommand({
  meta: {
    name: "lint",
    description: "Lint HTML emails for compatibility, spam, accessibility, and more. CI/CD-friendly with structured exit codes.",
  },
  args: {
    input: {
      type: "positional",
      description: "HTML file path or glob pattern",
      required: true,
    },
    format: {
      type: "string",
      alias: "f",
      description: "Input format: html, jsx, mjml, maizzle",
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
    },
    failOnWarning: {
      type: "boolean",
      description: "Exit 2 if warnings found",
    },
    skip: {
      type: "string",
      description: "Comma-separated checks to skip: spam,links,accessibility,images,compatibility,inboxPreview,size,templateVariables",
    },
    maxWarnings: {
      type: "string",
      description: "Fail if more than n warnings",
    },
  },
  async run({ args }) {
    try {
      // Parse --skip
      const skip: Array<string> = [];
      if (args.skip) {
        for (const s of args.skip.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (!VALID_SKIPS.has(s)) {
            throw new Error(`Unknown skip value "${s}". Valid: ${Array.from(VALID_SKIPS).join(", ")}`);
          }
          skip.push(s);
        }
      }

      const maxWarningsRaw = args.maxWarnings !== undefined ? parseInt(args.maxWarnings, 10) : undefined;
      if (maxWarningsRaw !== undefined && isNaN(maxWarningsRaw)) {
        throw new Error(`--maxWarnings must be a number, got: ${args.maxWarnings}`);
      }
      const maxWarnings = maxWarningsRaw ?? Infinity;
      const files = await resolveGlob(args.input);

      if (files.length === 0) {
        if (args.json) {
          console.log(JSON.stringify({ files: [], totalErrors: 0, totalWarnings: 0 }));
        } else {
          console.error(pc.red(`No files found matching: ${args.input}`));
        }
        process.exit(1);
      }

      const results: LintFileResult[] = [];
      let totalErrors = 0;
      let totalWarnings = 0;

      for (const file of files) {
        const format = resolveFormat(args.format, file);
        const source = await readInput(file);
        const html = await compile(source, format, file);
        const framework = toFramework(format);

        const report = auditEmail(html, {
          framework,
          skip: skip as AuditSkipType[],
        });

        const issues = flattenToLintIssues(report, skip);
        const errors = issues.filter((i) => i.severity === "error").length;
        const warnings = issues.filter((i) => i.severity === "warning").length;

        results.push({ file: relative(process.cwd(), file), issues, errors, warnings });
        totalErrors += errors;
        totalWarnings += warnings;
      }

      // Output
      if (args.json) {
        console.log(JSON.stringify({ files: results, totalErrors, totalWarnings }, null, 2));
      } else {
        for (const result of results) {
          console.log(pc.underline(result.file));
          if (result.issues.length === 0) {
            console.log(`  ${pc.green("pass")}  No issues found`);
          } else {
            for (const issue of result.issues) {
              const sev = issue.severity === "error"
                ? pc.red("error")
                : issue.severity === "warning"
                  ? pc.yellow("warn ")
                  : pc.blue("info ");
              console.log(`  ${sev}  ${pc.dim(issue.category.padEnd(18))}  ${pc.bold(issue.rule.padEnd(22))}  ${issue.message}`);
            }
          }
          console.log();
        }

        const summary = [
          `${files.length} file${files.length === 1 ? "" : "s"}`,
          totalErrors > 0 ? pc.red(`${totalErrors} error${totalErrors === 1 ? "" : "s"}`) : null,
          totalWarnings > 0 ? pc.yellow(`${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`) : null,
          totalErrors === 0 && totalWarnings === 0 ? pc.green("all clean") : null,
        ].filter(Boolean).join(" | ");

        console.log(summary);
      }

      // Exit codes
      if (totalErrors > 0) {
        process.exit(1);
      }
      if (args.failOnWarning && totalWarnings > 0) {
        if (!args.json) {
          console.error(pc.yellow(`\nFailed: ${totalWarnings} warning${totalWarnings === 1 ? "" : "s"} found (--failOnWarning)`));
        }
        process.exit(2);
      }
      if (Number.isFinite(maxWarnings) && totalWarnings > maxWarnings) {
        if (!args.json) {
          console.error(pc.red(`\nExceeded max warnings: ${totalWarnings} > ${maxWarnings}`));
        }
        process.exit(2);
      }
    } catch (err) {
      if (err instanceof CompileError) {
        console.error(pc.red(`Compilation failed (${err.phase}): ${err.message}`));
      } else {
        console.error(pc.red((err as Error).message));
      }
      process.exit(1);
    }
  },
});

type AuditSkipType = "spam" | "links" | "accessibility" | "images" | "compatibility" | "inboxPreview" | "size" | "templateVariables";

/**
 * Resolve a file path or simple glob pattern to an array of files.
 * Supports basic * glob in the last path segment.
 */
async function resolveGlob(pattern: string): Promise<string[]> {
  // If it's a direct file, just return it
  if (!pattern.includes("*")) {
    return [resolve(pattern)];
  }

  // Recursive glob is not supported — provide clear error
  if (pattern.includes("**")) {
    throw new Error("Recursive glob (**) is not supported. Use a single-level wildcard (e.g., src/*.html) or list files explicitly.");
  }

  // Simple glob: split into dir + glob pattern
  const lastSep = Math.max(pattern.lastIndexOf("/"), pattern.lastIndexOf("\\"));
  const dir = lastSep >= 0 ? pattern.slice(0, lastSep) : ".";
  const glob = lastSep >= 0 ? pattern.slice(lastSep + 1) : pattern;

  // Convert glob to regex (only support * wildcard)
  const regex = new RegExp("^" + glob.replace(/\*/g, ".*") + "$");

  const entries = await readdir(resolve(dir), { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && regex.test(e.name))
    .map((e) => resolve(dir, e.name))
    .sort();
}

/**
 * Flatten an AuditReport into a unified LintIssue array.
 */
function flattenToLintIssues(report: AuditReport, skip: string[]): LintIssue[] {
  const issues: LintIssue[] = [];

  // CSS compatibility warnings → group by property (deduplicate across clients)
  if (!skip.includes("compatibility")) {
    const seenProps = new Map<string, { severity: "error" | "warning" | "info"; clients: string[]; message: string }>();

    for (const w of report.compatibility.warnings) {
      const key = `${w.property}\0${w.severity}`;
      const existing = seenProps.get(key);
      if (existing) {
        existing.clients.push(w.client);
      } else {
        seenProps.set(key, {
          severity: w.severity,
          clients: [w.client],
          message: w.message,
        });
      }
    }

    for (const [key, val] of seenProps) {
      const property = key.split("\0")[0];
      issues.push({
        severity: val.severity,
        category: val.clients.slice(0, 3).join(",") + (val.clients.length > 3 ? `+${val.clients.length - 3}` : ""),
        rule: property,
        message: val.message,
      });
    }
  }

  if (!skip.includes("spam")) {
    for (const issue of report.spam.issues) {
      issues.push({
        severity: issue.severity,
        category: "spam",
        rule: issue.rule,
        message: issue.message,
        detail: issue.detail,
      });
    }
  }

  if (!skip.includes("links")) {
    for (const issue of report.links.issues) {
      issues.push({
        severity: issue.severity,
        category: "links",
        rule: issue.rule,
        message: issue.message,
      });
    }
  }

  if (!skip.includes("accessibility")) {
    for (const issue of report.accessibility.issues) {
      issues.push({
        severity: issue.severity,
        category: "accessibility",
        rule: issue.rule,
        message: issue.message,
      });
    }
  }

  if (!skip.includes("images")) {
    for (const issue of report.images.issues) {
      issues.push({
        severity: issue.severity,
        category: "images",
        rule: issue.rule,
        message: issue.message,
      });
    }
  }

  if (!skip.includes("inboxPreview")) {
    for (const issue of report.inboxPreview.issues) {
      issues.push({
        severity: issue.severity,
        category: "inboxPreview",
        rule: issue.rule,
        message: issue.message,
      });
    }
  }

  if (!skip.includes("size")) {
    for (const issue of report.size.issues) {
      issues.push({
        severity: issue.severity,
        category: "size",
        rule: issue.rule,
        message: issue.message,
      });
    }
  }

  if (!skip.includes("templateVariables")) {
    for (const issue of report.templateVariables.issues) {
      issues.push({
        severity: issue.severity,
        category: "templateVars",
        rule: issue.rule,
        message: issue.message,
      });
    }
  }

  // Sort: errors first, then warnings, then info
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return issues;
}
