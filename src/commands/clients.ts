import { defineCommand } from "citty";
import pc from "picocolors";
import Table from "cli-table3";
import { EMAIL_CLIENTS } from "@emailens/engine";

export default defineCommand({
  meta: {
    name: "clients",
    description: "List all supported email clients",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output as JSON",
    },
  },
  run({ args }) {
    if (args.json) {
      const data = EMAIL_CLIENTS.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        engine: c.engine,
        darkModeSupport: c.darkModeSupport,
      }));
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log();
    console.log(pc.bold("  Emailens — Supported Email Clients"));
    console.log();

    const table = new Table({
      head: [
        pc.bold("ID"),
        pc.bold("Name"),
        pc.bold("Category"),
        pc.bold("Engine"),
        pc.bold("Dark Mode"),
      ],
      style: { head: [], border: [] },
    });

    for (const client of EMAIL_CLIENTS) {
      table.push([
        client.id,
        client.name,
        client.category,
        client.engine,
        client.darkModeSupport ? pc.green("Yes") : pc.dim("No"),
      ]);
    }

    console.log(table.toString());
    console.log();
    console.log(pc.dim(`  ${EMAIL_CLIENTS.length} clients supported`));
    console.log();
  },
});
