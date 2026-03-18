import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineCommand } from "citty";
import ora from "ora";
import {
  transformForAllClients,
  analyzeEmail,
  generateCompatibilityScore,
  simulateDarkMode,
  warningsForClient,
  CompileError,
  type CSSWarning,
} from "@emailens/engine";

// toPlainText available in engine >=0.8.6
let toPlainText: ((html: string) => string) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ toPlainText } = require("@emailens/engine"));
} catch {
  // older engine version
}
import { readInput, resolveClients, resolveFormat, toFramework } from "../utils.js";
import { compile } from "@emailens/engine/compile";
import { generateHtmlReport } from "../output/html-report.js";
import { formatJsonOutput } from "../output/json.js";

export default defineCommand({
  meta: {
    name: "export",
    description: "Export compatibility report as JSON or HTML",
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
    clients: {
      type: "string",
      alias: "c",
      description: "Comma-separated client IDs to filter",
    },
    "dark-mode": {
      type: "boolean",
      alias: "d",
      description: "Include dark mode simulation",
    },
    screenshots: {
      type: "boolean",
      description: "Capture screenshots (requires BROWSERLESS_URL)",
    },
    out: {
      type: "string",
      alias: "o",
      description: "Output directory (default: ./emailens-report)",
    },
    json: {
      type: "boolean",
      description: "Export as JSON instead of HTML",
    },
    "plain-text": {
      type: "boolean",
      description: "Also export a plain text version (.txt) for multipart emails",
    },
    quiet: {
      type: "boolean",
      alias: "q",
      description: "Suppress spinners and decorations",
    },
  },
  async run({ args }) {
    const spinner = args.quiet ? null : ora();
    const outDir = resolve(args.out ?? "./emailens-report");

    try {
      // Resolve format early so we fail fast on invalid --format
      const format = resolveFormat(args.format, args.input);

      // Read input
      spinner?.start("Reading input...");
      const source = await readInput(args.input);
      spinner?.succeed("Input read");

      // Compile (passthrough for html, auto-detects from extension)
      const html = await compile(source, format, args.input !== "-" ? args.input : undefined);

      // Resolve clients
      const clientIds = resolveClients(args.clients);
      const clientSet = new Set(clientIds);

      // Transform
      spinner?.start("Transforming for all clients...");
      const allTransforms = transformForAllClients(html);
      const transforms = allTransforms.filter((t) => clientSet.has(t.clientId));
      spinner?.succeed(`Transformed for ${transforms.length} clients`);

      // Analyze
      spinner?.start("Analyzing compatibility...");
      const framework = toFramework(format);
      const warnings = analyzeEmail(html, framework);
      const allScores = generateCompatibilityScore(warnings);

      const scores: typeof allScores = {};
      for (const [id, data] of Object.entries(allScores)) {
        if (clientSet.has(id)) {
          scores[id] = data;
        }
      }
      const filteredWarnings = clientIds.flatMap(id => warningsForClient(warnings, id));
      spinner?.succeed("Analysis complete");

      // Dark mode
      let darkMode: Record<string, { html: string; warnings: CSSWarning[] }> | undefined;
      if (args["dark-mode"]) {
        spinner?.start("Simulating dark mode...");
        darkMode = {};
        for (const t of transforms) {
          darkMode[t.clientId] = simulateDarkMode(t.html, t.clientId);
        }
        spinner?.succeed("Dark mode simulation complete");
      }

      // Screenshots
      if (args.screenshots) {
        spinner?.start("Capturing screenshots...");
        try {
          const { captureScreenshots } = await import("../screenshots.js");
          const screenshotDir = join(outDir, "screenshots");
          const results = await captureScreenshots(
            transforms,
            screenshotDir,
            (clientId, index, total) => {
              if (spinner) spinner.text = `Capturing screenshots (${index}/${total}: ${clientId})...`;
            },
          );
          spinner?.succeed(`Screenshots saved (${results.size} files)`);
        } catch (err) {
          spinner?.warn(`Screenshots skipped: ${(err as Error).message}`);
        }
      }

      // Export
      mkdirSync(outDir, { recursive: true });

      if (args.json) {
        spinner?.start("Exporting JSON...");
        const jsonData = formatJsonOutput({ scores, warnings: filteredWarnings, transforms });
        const jsonPath = join(outDir, "report.json");
        writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
        spinner?.succeed(`JSON report saved to ${jsonPath}`);
      } else {
        spinner?.start("Generating HTML report...");
        const htmlReport = generateHtmlReport({
          scores,
          warnings: filteredWarnings,
          transforms,
          darkMode,
          originalHtml: html,
        });

        const htmlPath = join(outDir, "report.html");
        writeFileSync(htmlPath, htmlReport);
        spinner?.succeed(`HTML report saved to ${htmlPath}`);
      }

      // Plain text export
      if (args["plain-text"] && toPlainText) {
        spinner?.start("Generating plain text version...");
        const plainText = toPlainText(html);
        const txtPath = join(outDir, "email.txt");
        writeFileSync(txtPath, plainText);
        spinner?.succeed(`Plain text saved to ${txtPath}`);
      } else if (args["plain-text"] && !toPlainText) {
        spinner?.warn("Plain text export requires @emailens/engine >=0.8.6");
      }

      if (!args.quiet) {
        console.log();
        console.log(`  Output: ${outDir}`);
        console.log();
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
