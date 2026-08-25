import { defineCommand } from "citty";
import ora from "ora";
import {
  analyzeEmail,
  generateCompatibilityScore,
  warningsForClient,
  CompileError,
} from "@emailens/engine";
import { positionsApply, readInput, resolveClients, resolveFormat, toFramework } from "../utils.js";
import { compile } from "@emailens/engine/compile";
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
      const html = await compile(source, format);

      // Resolve clients
      const clientIds = resolveClients(args.clients);

      // Analyze
      spinner?.start("Analyzing compatibility...");
      const framework = toFramework(format);
      // Positions only mean something when the file analyzed is the file the
      // user wrote, see positionsApply().
      const warnings = analyzeEmail(html, framework, { positions: positionsApply(format) });
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
      const filteredWarnings = clientIds.flatMap(id => warningsForClient(warnings, id));

      spinner?.succeed("Analysis complete");

      // Output
      if (args.json) {
        printJson({ scores, warnings: filteredWarnings });
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
