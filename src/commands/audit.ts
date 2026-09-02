import { defineCommand } from "citty";
import ora from "ora";
import pc from "picocolors";
import Table from "cli-table3";
import {
  auditEmail,
  CompileError,
  type AuditReport,
} from "@emailens/engine";
import { readInput, resolveFormat, toFramework } from "../utils.js";
import { compile } from "@emailens/engine/compile";
import { printScoreTable, printWarnings } from "../output/terminal.js";

const VALID_SKIPS = new Set(["spam", "links", "accessibility", "images", "compatibility", "overflow", "visual", "darkContrast", "mobileContrast", "design", "vml", "styleSurvival"]);

export default defineCommand({
  meta: {
    name: "audit",
    description: "Full email audit: compatibility + spam + links + accessibility + images + overflow + visual + contrast + design + Outlook VML",
  },
  args: {
    input: {
      type: "positional",
      description: "HTML file path or - for stdin",
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
    quiet: {
      type: "boolean",
      alias: "q",
      description: "Suppress spinners and decorations",
    },
    skip: {
      type: "string",
      description: "Comma-separated checks to skip: spam,links,accessibility,images,compatibility,overflow,visual,darkContrast,mobileContrast,design,vml",
    },
  },
  async run({ args }) {
    const spinner = (args.quiet || args.json) ? null : ora();

    try {
      const format = resolveFormat(args.format, args.input);

      // Read input
      spinner?.start("Reading input...");
      const source = await readInput(args.input);
      spinner?.succeed("Input read");

      // Compile
      const html = await compile(source, format);

      // Parse --skip flag
      const skip: Array<"spam" | "links" | "accessibility" | "images" | "compatibility" | "overflow" | "visual" | "darkContrast" | "mobileContrast" | "design" | "vml" | "styleSurvival"> = [];
      if (args.skip) {
        for (const s of args.skip.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (!VALID_SKIPS.has(s)) {
            throw new Error(`Unknown skip value "${s}". Valid: ${Array.from(VALID_SKIPS).join(", ")}`);
          }
          skip.push(s as typeof skip[number]);
        }
      }

      // Run audit
      spinner?.start("Running full audit...");
      const framework = toFramework(format);
      const report = auditEmail(html, { framework, skip });
      spinner?.succeed("Audit complete");

      // Output
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        // Compatibility section
        if (!skip.includes("compatibility")) {
          printScoreTable(report.compatibility.scores, report.compatibility.warnings, { quiet: args.quiet });
          printWarnings(report.compatibility.warnings, { quiet: args.quiet });
        }

        // Quality summary
        printQualitySummary(report, skip, { quiet: args.quiet });
      }
    } catch (err) {
      if (err instanceof CompileError) {
        spinner?.fail(`Compilation failed (${err.phase}): ${err.message}`);
      } else {
        spinner?.fail((err as Error).message);
      }
      process.exit(1);
    }
  },
});

function printQualitySummary(
  report: AuditReport,
  skip: string[],
  options?: { quiet?: boolean },
): void {
  if (!options?.quiet) {
    console.log(pc.bold("  Quality Summary"));
    console.log();
  }

  const table = new Table({
    head: [pc.bold("Check"), pc.bold("Result")],
    style: { head: [], border: [] },
  });

  if (!skip.includes("spam")) {
    const { score, level, issues } = report.spam;
    const color = score >= 90 ? pc.green : score >= 70 ? pc.yellow : pc.red;
    table.push(["Content Hygiene", `${color(String(score))}/100 (${level}), ${issues.length} issue${issues.length === 1 ? "" : "s"}`]);
  }

  if (!skip.includes("links")) {
    const { totalLinks, issues } = report.links;
    const color = issues.length === 0 ? pc.green : pc.yellow;
    table.push(["Links", `${totalLinks} link${totalLinks === 1 ? "" : "s"}, ${color(`${issues.length} issue${issues.length === 1 ? "" : "s"}`)}`]);
  }

  if (!skip.includes("accessibility")) {
    const { score, issues } = report.accessibility;
    const color = score >= 90 ? pc.green : score >= 70 ? pc.yellow : pc.red;
    table.push(["Accessibility", `${color(String(score))}/100, ${issues.length} issue${issues.length === 1 ? "" : "s"}`]);
  }

  if (!skip.includes("images")) {
    const { total, issues } = report.images;
    const color = issues.length === 0 ? pc.green : pc.yellow;
    table.push(["Images", `${total} image${total === 1 ? "" : "s"}, ${color(`${issues.length} issue${issues.length === 1 ? "" : "s"}`)}`]);
  }

  if (!skip.includes("overflow")) {
    const { issues } = report.overflow;
    const color = issues.length === 0 ? pc.green : pc.yellow;
    table.push(["Content Overflow", color(`${issues.length} issue${issues.length === 1 ? "" : "s"}`)]);
  }

  if (!skip.includes("visual")) {
    const { issues } = report.visual;
    const color = issues.length === 0 ? pc.green : pc.yellow;
    table.push(["Visual Bugs", color(`${issues.length} issue${issues.length === 1 ? "" : "s"}`)]);
  }

  // Contrast findings are errors, not tips: text at 1:1 is invisible, not untidy.
  if (!skip.includes("darkContrast")) {
    const n = report.darkContrast.length;
    const color = n === 0 ? pc.green : pc.red;
    table.push(["Dark Mode Contrast", color(`${n} issue${n === 1 ? "" : "s"}`)]);
  }

  if (!skip.includes("mobileContrast")) {
    const n = report.mobileContrast.length;
    const color = n === 0 ? pc.green : pc.red;
    table.push(["Mobile Contrast", color(`${n} issue${n === 1 ? "" : "s"}`)]);
  }

  // VML faults are red, not yellow: a nested shape does not degrade the render,
  // it deletes a region of it and everything after.
  if (!skip.includes("vml")) {
    const { issues } = report.vml;
    const color = issues.length === 0 ? pc.green : pc.red;
    table.push(["Outlook VML", color(`${issues.length} issue${issues.length === 1 ? "" : "s"}`)]);
  }

  if (!skip.includes("design")) {
    const { issues } = report.design;
    const color = issues.length === 0 ? pc.green : pc.yellow;
    table.push(["Design Consistency", color(`${issues.length} issue${issues.length === 1 ? "" : "s"}`)]);
  }

  // Red like VML, and for the same reason: these are not degraded renders but
  // stylesheets a client throws away, silently and often in full.
  if (!skip.includes("styleSurvival")) {
    const { issues } = report.styleSurvival;
    const color = issues.length === 0 ? pc.green : pc.red;
    table.push(["Style Survival", color(`${issues.length} issue${issues.length === 1 ? "" : "s"}`)]);
  }

  console.log(table.toString());
  console.log();
}
