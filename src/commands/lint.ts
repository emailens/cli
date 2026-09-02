import { defineCommand } from "citty";
import pc from "picocolors";
import { positionsApply, readInput, resolveFormat, toFramework } from "../utils.js";
import { compile } from "@emailens/engine/compile";
import {
  auditEmail,
  CompileError,
  MAX_WARNING_LOCATIONS,
  type AuditReport,
  type SourceLocation,
} from "@emailens/engine";
import { applySeverities, loadProjectConfig } from "../project-config.js";
import { readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";

interface LintIssue {
  severity: "error" | "warning" | "info";
  category: string;
  rule: string;
  message: string;
  detail?: string;
  /** Where in the file the issue is. HTML sources only, see `positionsApply`. */
  loc?: SourceLocation;
  /** Every place a CSS property breaks, in document order. */
  locs?: SourceLocation[];
  /** `locs` is capped and does not list every occurrence. */
  locsTruncated?: boolean;
}

interface LintFileResult {
  file: string;
  issues: LintIssue[];
  errors: number;
  warnings: number;
}

const VALID_SKIPS = new Set([
  "spam", "links", "accessibility", "images",
  "compatibility", "inboxPreview", "size", "templateVariables", "overflow", "visual",
  "darkContrast", "mobileContrast", "design", "vml", "styleSurvival",
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
      description: "Comma-separated checks to skip: spam,links,accessibility,images,compatibility,inboxPreview,size,templateVariables,overflow,visual,vml",
    },
    maxWarnings: {
      type: "string",
      description: "Fail if more than n warnings",
    },
  },
  async run({ args }) {
    try {
      // `.emailensrc`, the same file the editor extension reads. Without this
      // a rule demoted in the editor still fails the build, which is the worst
      // of both: the panel says it does not matter and CI says it does.
      const project = loadProjectConfig();
      if (project?.invalid.length && !args.json) {
        console.error(
          pc.yellow(
            `${project.source}: ignoring ${project.invalid.join(", ")}, ` +
              `a severity must be "error", "warning", "info" or "off".`,
          ),
        );
      }

      // Parse --skip. A flag is an explicit choice for this invocation and
      // wins over the file; in the editor it is the other way round, because
      // an editor setting is ambient and the repo's file is the team's.
      const skip: Array<string> = [];
      if (!args.skip) {
        for (const s of project?.skip ?? []) {
          // Named rather than dropped: a team that believes spam checking is
          // off and finds it is not has been misled by their own config.
          if (VALID_SKIPS.has(s)) skip.push(s);
          else if (!args.json) {
            console.error(pc.yellow(`${project?.source}: unknown skip value "${s}", ignoring.`));
          }
        }
      }
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
        const html = await compile(source, format);
        const framework = toFramework(format);

        // Positions describe the HTML that was analyzed. For jsx/mjml/maizzle
        // that is compiled output whose lines have nothing to do with the file
        // the user wrote, so we only ask for, and only report, positions when
        // the source IS the analyzed HTML.
        const positions = positionsApply(format);

        const report = auditEmail(html, {
          framework,
          skip: skip as AuditSkipType[],
          positions,
        });

        const issues = applySeverities(flattenToLintIssues(report, skip), project?.rules);
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
            // Only reserve the position column when this file has positions to
            // show; compiled sources never do.
            const width = result.issues.reduce(
              (w, i) => (i.loc ? Math.max(w, `${i.loc.line}:${i.loc.column}`.length) : w),
              0,
            );
            for (const issue of result.issues) {
              const sev = issue.severity === "error"
                ? pc.red("error")
                : issue.severity === "warning"
                  ? pc.yellow("warn ")
                  : pc.blue("info ");
              const pos = width > 0
                ? `${pc.dim((issue.loc ? `${issue.loc.line}:${issue.loc.column}` : "").padStart(width))}  `
                : "";
              console.log(`  ${sev}  ${pos}${pc.dim(issue.category.padEnd(18))}  ${pc.bold(issue.rule.padEnd(22))}  ${issue.message}`);
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

type AuditSkipType = "spam" | "links" | "accessibility" | "images" | "compatibility" | "inboxPreview" | "size" | "templateVariables" | "overflow" | "visual" | "darkContrast" | "mobileContrast" | "design" | "vml" | "styleSurvival";


/**
 * Resolve a file path or simple glob pattern to an array of files.
 * Supports basic * glob in the last path segment.
 */
async function resolveGlob(pattern: string): Promise<string[]> {
  // If it's a direct file, just return it
  if (!pattern.includes("*")) {
    return [resolve(pattern)];
  }

  // Recursive glob is not supported: provide clear error
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
 * Add occurrences we haven't already recorded, keeping document order.
 *
 * Grouping unions several engine warnings, each already capped, so the cap has
 * to be applied again here or a document with many selector shapes produces an
 * unbounded list. Returns true when it bit, so the issue can say so.
 */
function mergeLocs(into: SourceLocation[], from: SourceLocation[] | undefined): boolean {
  if (!from) return false;
  let truncated = false;
  for (const loc of from) {
    if (into.some((l) => l.offset === loc.offset)) continue;
    if (into.length >= MAX_WARNING_LOCATIONS) {
      truncated = true;
      break;
    }
    into.push(loc);
  }
  into.sort((a, b) => a.offset - b.offset);
  return truncated;
}

/**
 * Flatten an AuditReport into a unified LintIssue array.
 */
function flattenToLintIssues(report: AuditReport, skip: string[]): LintIssue[] {
  const issues: LintIssue[] = [];

  // CSS compatibility warnings → group by property (deduplicate across clients)
  if (!skip.includes("compatibility")) {
    const seenProps = new Map<string, {
      severity: "error" | "warning" | "info";
      clients: string[];
      message: string;
      loc?: SourceLocation;
      locs: SourceLocation[];
      locsTruncated?: boolean;
    }>();

    for (const w of report.compatibility.warnings) {
      const key = `${w.property}\0${w.severity}`;
      const existing = seenProps.get(key);
      if (existing) {
        existing.clients.push(w.client);
        // Clients repeat the same finding, but selector groups don't: `div` and
        // `span` breaking one property are separate warnings, so union their
        // occurrences to get every place it actually breaks.
        existing.loc ??= w.loc;
        if (mergeLocs(existing.locs, w.locs)) existing.locsTruncated = true;
        if (w.locsTruncated) existing.locsTruncated = true;
      } else {
        seenProps.set(key, {
          severity: w.severity,
          clients: [w.client],
          message: w.message,
          loc: w.loc,
          locs: (w.locs ?? []).slice(0, MAX_WARNING_LOCATIONS),
          ...(w.locsTruncated ? { locsTruncated: true } : {}),
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
        ...(val.loc ? { loc: val.loc } : {}),
        ...(val.locs.length ? { locs: val.locs } : {}),
        ...(val.locsTruncated ? { locsTruncated: true } : {}),
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
        ...(issue.loc ? { loc: issue.loc } : {}),
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
        ...(issue.loc ? { loc: issue.loc } : {}),
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
        ...(issue.loc ? { loc: issue.loc } : {}),
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
        ...(issue.loc ? { loc: issue.loc } : {}),
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
        ...(issue.loc ? { loc: issue.loc } : {}),
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
        ...(issue.loc ? { loc: issue.loc } : {}),
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
        ...(issue.loc ? { loc: issue.loc } : {}),
      });
    }
  }

  if (!skip.includes("overflow")) {
    for (const issue of report.overflow.issues) {
      issues.push({
        severity: issue.severity,
        category: "overflow",
        rule: issue.rule,
        message: issue.message,
        ...(issue.loc ? { loc: issue.loc } : {}),
      });
    }
  }

  if (!skip.includes("visual")) {
    for (const issue of report.visual.issues) {
      issues.push({
        severity: issue.severity,
        category: "visual",
        rule: issue.rule,
        message: issue.message,
        ...(issue.loc ? { loc: issue.loc } : {}),
      });
    }
  }

  // Contrast in the two renders a desktop light preview never shows. These are
  // flat arrays rather than a report with `.issues`, and their messages arrive
  // prefixed ("Dark mode: …"), which the category column already says.
  if (!skip.includes("darkContrast")) {
    for (const issue of report.darkContrast) {
      issues.push({
        severity: issue.severity,
        category: "darkContrast",
        rule: issue.rule,
        message: issue.message.replace(/^Dark mode: /, ""),
        ...(issue.loc ? { loc: issue.loc } : {}),
      });
    }
  }

  if (!skip.includes("mobileContrast")) {
    for (const issue of report.mobileContrast) {
      issues.push({
        severity: issue.severity,
        category: "mobileContrast",
        rule: issue.rule,
        message: issue.message.replace(/^At mobile width: /, ""),
        ...(issue.loc ? { loc: issue.loc } : {}),
      });
    }
  }

  if (!skip.includes("vml")) {
    for (const issue of report.vml.issues) {
      issues.push({
        severity: issue.severity,
        category: "vml",
        rule: issue.rule,
        message: issue.message,
        detail: issue.detail,
        ...(issue.loc ? { loc: issue.loc } : {}),
      });
    }
  }

  if (!skip.includes("styleSurvival")) {
    for (const issue of report.styleSurvival.issues) {
      // The clients are the finding here: "Gmail drops this block" is the
      // whole point, and the message alone does not carry it in lint output.
      const clients = issue.clients.length ? ` (${issue.clients.join(", ")})` : "";
      issues.push({
        severity: issue.severity,
        category: "styleSurvival",
        rule: issue.rule,
        message: `${issue.message}${clients}`,
        detail: issue.frameworkNote ?? issue.detail,
        ...(issue.loc ? { loc: issue.loc } : {}),
      });
    }
  }

  if (!skip.includes("design")) {
    for (const issue of report.design.issues) {
      issues.push({
        severity: issue.severity,
        category: "design",
        rule: issue.rule,
        message: issue.message,
        detail: issue.detail,
      });
    }
  }

  // Sort: errors first, then warnings, then info
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return issues;
}
