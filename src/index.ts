import { defineCommand, runMain } from "citty";
import analyze from "./commands/analyze.js";
import preview from "./commands/preview.js";
import clients from "./commands/clients.js";
import exportCmd from "./commands/export.js";
import fix from "./commands/fix.js";
import audit from "./commands/audit.js";

const main = defineCommand({
  meta: {
    name: "emailens",
    version: "0.3.0",
    description: "Email compatibility analysis CLI — preview how HTML emails render across 12 email clients.",
  },
  subCommands: {
    analyze,
    preview,
    clients,
    export: exportCmd,
    fix,
    audit,
  },
});

runMain(main);
