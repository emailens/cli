import { defineCommand } from "citty";
import ora from "ora";
import pc from "picocolors";
import {
  analyzeEmail,
  generateCompatibilityScore,
  generateAiFix,
  estimateAiFixTokens,
  AI_FIX_SYSTEM_PROMPT,
  CompileError,
  type AiProvider,
} from "@emailens/engine";
import { readInput, resolveClients, resolveFormat, toFramework } from "../utils.js";
import { compile } from "@emailens/engine/compile";

export default defineCommand({
  meta: {
    name: "fix",
    description: "Generate AI-powered fixes for email compatibility issues",
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
      description: "Comma-separated client IDs to scope the fix",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Write fixed code to file instead of stdout",
    },
    json: {
      type: "boolean",
      description: "Output as JSON (includes token estimates and metadata)",
    },
    quiet: {
      type: "boolean",
      alias: "q",
      description: "Suppress spinners and decorations",
    },
    estimate: {
      type: "boolean",
      description: "Only show token estimate without calling the AI",
    },
    "max-tokens": {
      type: "string",
      description: "Maximum input tokens for the prompt (default: 16000)",
    },
  },
  async run({ args }) {
    const spinner = (args.quiet || args.json) ? null : ora();

    try {
      const format = resolveFormat(args.format, args.input);
      const framework = toFramework(format);

      // Read and compile input
      spinner?.start("Reading input...");
      const source = await readInput(args.input);
      const html = await compile(source, format);
      spinner?.succeed("Input read");

      // Analyze
      spinner?.start("Analyzing compatibility...");
      const warnings = analyzeEmail(html, framework);
      const scores = generateCompatibilityScore(warnings);
      spinner?.succeed(`Found ${warnings.length} warnings`);

      if (warnings.length === 0) {
        if (args.json) {
          console.log(JSON.stringify({ message: "No issues found", code: source }, null, 2));
        } else {
          console.log(pc.green("\n  No compatibility issues found — nothing to fix.\n"));
        }
        return;
      }

      // Resolve scope
      const clientIds = resolveClients(args.clients);
      let scope: "current" | "all";
      let selectedClientId: string | undefined;
      let scopedWarnings = warnings;
      let scopedScores = scores;

      if (args.clients && clientIds.length === 1) {
        // Single client: use engine's "current" scope
        scope = "current";
        selectedClientId = clientIds[0];
      } else if (args.clients && clientIds.length > 1) {
        // Multiple clients: pre-filter warnings/scores, then use "all" scope
        // so the engine processes all of them without needing "current" + single ID
        const clientSet = new Set(clientIds);
        scope = "all";
        selectedClientId = undefined;
        scopedWarnings = warnings.filter((w) => clientSet.has(w.client));
        scopedScores = Object.fromEntries(
          Object.entries(scores).filter(([id]) => clientSet.has(id)),
        );
      } else {
        // No --clients flag: fix for all clients
        scope = "all";
        selectedClientId = undefined;
      }

      // Token estimate
      const maxInputTokens = args["max-tokens"] ? parseInt(args["max-tokens"], 10) : 16000;
      const estimate = await estimateAiFixTokens({
        originalHtml: html,
        warnings: scopedWarnings,
        scores: scopedScores,
        scope,
        selectedClientId,
        format,
        maxInputTokens,
      });

      const structuralPct = estimate.warningCount > 0
        ? Math.round((estimate.structuralCount / estimate.warningCount) * 100)
        : 0;

      if (args.estimate) {
        if (args.json) {
          console.log(JSON.stringify(estimate, null, 2));
        } else {
          console.log(`\n  ${pc.bold("Token Estimate")}`);
          console.log(`  Input tokens:    ~${estimate.inputTokens.toLocaleString()}`);
          console.log(`  Output tokens:   ~${estimate.estimatedOutputTokens.toLocaleString()}`);
          console.log(`  Warnings:        ${estimate.warningCount} (${estimate.structuralCount} structural)`);
          if (estimate.truncated) {
            console.log(`  ${pc.yellow(`Truncated: ${estimate.warningsRemoved} low-priority warnings removed`)}`);
          }
          console.log();
        }
        return;
      }

      // Check for API key
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        spinner?.fail("ANTHROPIC_API_KEY environment variable is required");
        console.error(pc.dim("\n  Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n"));
        process.exit(1);
      }

      // Show estimate before calling
      if (!args.quiet && !args.json) {
        console.log(pc.dim(`  ~${estimate.inputTokens.toLocaleString()} input tokens, ${estimate.warningCount} warnings (${structuralPct}% structural)`));
        if (estimate.truncated) {
          console.log(pc.yellow(`  Truncated ${estimate.warningsRemoved} low-priority warnings to fit token limit`));
        }
      }

      // Call AI
      spinner?.start("Generating AI fix...");

      let Anthropic: typeof import("@anthropic-ai/sdk").default;
      try {
        Anthropic = (await import("@anthropic-ai/sdk")).default;
      } catch {
        spinner?.fail("@anthropic-ai/sdk is required for the fix command");
        console.error(pc.dim("\n  Install it with: npm install @anthropic-ai/sdk\n"));
        process.exit(1);
      }

      const anthropic = new Anthropic({ apiKey });

      const provider: AiProvider = async (prompt) => {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: AI_FIX_SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        });
        const textBlock = msg.content.find((b: { type: string }) => b.type === "text");
        return textBlock?.type === "text" ? (textBlock as { type: "text"; text: string }).text : "";
      };

      const result = await generateAiFix({
        originalHtml: html,
        warnings: scopedWarnings,
        scores: scopedScores,
        scope,
        selectedClientId,
        format,
        maxInputTokens,
        provider,
      });

      spinner?.succeed(`Fixed ${result.targetedWarnings} warnings (${result.structuralCount} structural)`);

      // Output
      if (args.output) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(args.output, result.code, "utf-8");
        if (!args.quiet) {
          console.log(pc.green(`\n  Fixed code written to ${args.output}\n`));
        }
      } else if (args.json) {
        console.log(JSON.stringify({
          code: result.code,
          targetedWarnings: result.targetedWarnings,
          structuralCount: result.structuralCount,
          tokenEstimate: result.tokenEstimate,
        }, null, 2));
      } else {
        console.log("\n" + result.code);
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
