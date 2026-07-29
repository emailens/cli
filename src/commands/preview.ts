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
import { readInput, resolveClients, resolveFormat, toFramework } from "../utils.js";
import { compile } from "@emailens/engine/compile";
import { printScoreTable, printWarnings } from "../output/terminal.js";
import { printJson } from "../output/json.js";

export default defineCommand({
  meta: {
    name: "preview",
    description: "Full email preview: transforms, analysis, dark mode, screenshots",
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
      description: "Output directory for screenshots",
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
  },
  async run({ args }) {
    const spinner = (args.quiet || args.json) ? null : ora();

    try {
      // Resolve format early so we fail fast on invalid --format
      const format = resolveFormat(args.format, args.input);

      // Read input
      spinner?.start("Reading input...");
      const source = await readInput(args.input);
      spinner?.succeed("Input read");

      // Compile (passthrough for html, auto-detects from extension)
      const html = await compile(source, format);

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
        const outDir = args.out ?? "./emailens-screenshots";
        spinner?.start("Capturing screenshots...");
        try {
          const { captureScreenshots } = await import("../screenshots.js");
          const results = await captureScreenshots(
            transforms,
            outDir,
            (clientId, index, total) => {
              if (spinner) spinner.text = `Capturing screenshots (${index}/${total}: ${clientId})...`;
            },
          );
          spinner?.succeed(`Screenshots saved to ${outDir} (${results.size} files)`);
        } catch (err) {
          spinner?.warn(`Screenshots skipped: ${(err as Error).message}`);
        }
      }

      // Output
      if (args.json) {
        printJson({ scores, warnings: filteredWarnings, transforms, darkMode });
      } else {
        printScoreTable(scores, filteredWarnings, { quiet: args.quiet });
        printWarnings(filteredWarnings, { quiet: args.quiet });
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
