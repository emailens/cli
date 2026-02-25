import { defineCommand } from "citty";
import ora from "ora";
import {
  analyzeEmail,
  generateCompatibilityScore,
} from "@emailens/engine";
import { readInput, resolveClients, resolveFormat, toFramework } from "../utils.js";
import { compile } from "../compile/index.js";
import { printScoreTable, printWarnings } from "../output/terminal.js";
import { printJson } from "../output/json.js";

export default defineCommand({
  meta: {
    name: "analyze",
    description: "Analyze email CSS compatibility across clients",
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
    // --json implies quiet spinners
    const spinner = (args.quiet || args.json) ? null : ora();

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

      // Analyze
      spinner?.start("Analyzing compatibility...");
      const framework = toFramework(format);
      const warnings = analyzeEmail(html, framework);
      const allScores = generateCompatibilityScore(warnings);

      // Filter scores to requested clients
      const clientSet = new Set(clientIds);
      const scores: typeof allScores = {};
      for (const [id, data] of Object.entries(allScores)) {
        if (clientSet.has(id)) {
          scores[id] = data;
        }
      }

      // Filter warnings to requested clients
      const filteredWarnings = warnings.filter((w) => clientSet.has(w.client));

      spinner?.succeed("Analysis complete");

      // Output
      if (args.json) {
        printJson({ scores, warnings: filteredWarnings });
      } else {
        printScoreTable(scores, filteredWarnings, { quiet: args.quiet });
        printWarnings(filteredWarnings, { quiet: args.quiet });
      }
    } catch (err) {
      spinner?.fail((err as Error).message);
      process.exit(1);
    }
  },
});
