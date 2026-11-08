import { defineCommand } from "citty";
import pc from "picocolors";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";
import lint from "./lint.js";
import { EMAIL_DIRS, findEmailsDir } from "../react-email.js";

/**
 * `emailens react-email`: lint a React Email project with nothing to set up.
 * Finds the emails folder `email dev` would use, renders every template with
 * the project's own React Email and PreviewProps, and checks the HTML. The
 * linting itself is `lint` on that folder, so flags and exit codes match.
 */
export default defineCommand({
  meta: {
    name: "react-email",
    description: "Lint every React Email template in this project: no export step, PreviewProps applied. --watch re-checks on save",
  },
  args: {
    dir: { type: "positional", required: false, description: `Emails folder (default: the first of ${EMAIL_DIRS.join(", ")})` },
    watch: { type: "boolean", alias: "w", description: "Re-check whenever a template changes" },
    json: { type: "boolean", description: "Output as JSON" },
    info: { type: "boolean", description: "List info findings too" },
    failOnWarning: { type: "boolean", description: "Exit 2 if warnings found" },
    skip: { type: "string", description: "Comma-separated checks to skip, as for lint" },
    "email-type": { type: "string", description: "transactional: sign-in, receipts and alerts need no unsubscribe link" },
    gate: { type: "boolean", description: "Also run each email through the pre-send gate (Pro, needs EMAILENS_API_KEY)" },
    "api-key": { type: "string", description: "API key for --gate (default: EMAILENS_API_KEY)" },
    reporter: { type: "string", description: "github: annotate the pull request" },
    quiet: { type: "boolean", alias: "q", description: "No hosted-preview line after a failure" },
  },
  async run({ args, rawArgs }) {
    const dir = args.dir ? resolve(args.dir) : findEmailsDir();
    if (!dir) {
      console.error(pc.red(`No emails folder here. Looked for ${EMAIL_DIRS.join(", ")}; pass the folder: emailens react-email path/to/emails`));
      process.exit(1);
    }

    if (!args.watch) {
      await lint.run!({ args: { ...args, input: dir, _: [] } as never, rawArgs, cmd: lint } as never);
      return;
    }

    // Each check runs in a fresh process: a template edited and re-imported
    // in this one would keep its first version in the module cache.
    const passOn = rawArgs.filter((a) => a !== "--watch" && a !== "-w" && a !== args.dir);
    const check = () => {
      console.clear();
      spawn(process.execPath, [process.argv[1], "lint", dir, ...passOn], { stdio: "inherit" }).on("exit", () =>
        console.log(pc.dim(`\nWatching ${dir} for changes. Ctrl+C to stop.`)),
      );
    };
    let timer: NodeJS.Timeout | undefined;
    // ponytail: recursive fs.watch needs Node 20+ on Linux; on 18 this throws and says so.
    watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(check, 150);
    });
    check();
  },
});
