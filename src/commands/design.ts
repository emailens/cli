import { defineCommand } from "citty";
import ora from "ora";
import pc from "picocolors";
import { compile } from "@emailens/engine/compile";
import { readInput, resolveClients, resolveFormat, toFramework } from "../utils.js";
import type { DesignResult } from "@emailens/engine/design";

const MARK = { kept: pc.green("✓"), changed: pc.yellow("~"), broken: pc.red("✗") };

/** Exit code: 1 when a client breaks the design, or, with `strict`, changes it. */
export function designExitCode(results: DesignResult[], strict = false): number {
  const failing = results.some(
    (r) => r.verdict === "broken" || (strict && r.verdict === "changed"),
  );
  return failing ? 1 : 0;
}

export default defineCommand({
  meta: {
    name: "design",
    description:
      "Check the email still looks like its design in each client's live preview (needs a browser)",
  },
  args: {
    input: {
      type: "positional",
      description: "HTML, JSX, MJML or Maizzle file path, or - for stdin",
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
      description: "Comma-separated client IDs (default: all)",
    },
    strict: {
      type: "boolean",
      description: "Fail on Needs work too, not only on Broken",
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
    const spinner = args.quiet || args.json ? null : ora();
    try {
      if (args.format) resolveFormat(args.format);
      const source = await readInput(args.input);
      const format = resolveFormat(args.format, args.input, source);
      const html = await compile(source, format);
      const clientIds = resolveClients(args.clients);

      const { checkDesignAcross } = await import("@emailens/engine/design");
      spinner?.start(process.env.BROWSERLESS_URL ? "Connecting to Browserless..." : "Starting Chromium...");
      const results = await checkDesignAcross(html, clientIds, {
        framework: toFramework(format),
        onProgress: (done, total) => {
          if (spinner) spinner.text = `Checking the design (${done}/${total})...`;
        },
      });
      spinner?.stop();

      if (!results.length && !args.json) {
        console.log("No design to compare: the input is not a rendered email.");
      } else if (args.json) {
        console.log(JSON.stringify({ design: results }, null, 2));
      } else {
        for (const r of results) {
          console.log(`${MARK[r.verdict]} ${pc.bold(r.name.padEnd(26))} ${r.label}`);
          if (r.verdict === "kept") continue;
          console.log(pc.dim(`    ${r.sentence}`));
          for (const reason of r.reasons) console.log(`    - ${reason}`);
          if (r.more) console.log(pc.dim(`    and ${r.more} more`));
        }
      }
      const code = designExitCode(results, args.strict);
      if (code) process.exit(code);
    } catch (err) {
      spinner?.fail("Design check failed");
      console.error((err as Error).message);
      process.exit(1);
    }
  },
});
