import { defineCommand, runMain } from "citty";
import { meta } from "./meta.js";
import analyze from "./commands/analyze.js";
import preview from "./commands/preview.js";
import clients from "./commands/clients.js";
import exportCmd from "./commands/export.js";
import fix from "./commands/fix.js";
import audit from "./commands/audit.js";
import lint from "./commands/lint.js";

const main = defineCommand({
  meta,
  subCommands: {
    analyze,
    preview,
    clients,
    export: exportCmd,
    fix,
    audit,
    lint,
  },
});

runMain(main);
