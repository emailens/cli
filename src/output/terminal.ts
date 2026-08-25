import pc from "picocolors";
import Table from "cli-table3";
import {
  EMAIL_CLIENTS,
  type CSSWarning,
} from "@emailens/engine";

/**
 * Color-code a score value: green >=90, yellow >=70, red <70.
 */
function colorScore(score: number): string {
  const str = String(score);
  if (score >= 90) return pc.green(str);
  if (score >= 70) return pc.yellow(str);
  return pc.red(str);
}

/**
 * Get severity icon.
 */
function severityIcon(severity: CSSWarning["severity"]): string {
  switch (severity) {
    case "error": return pc.red("✗");
    case "warning": return pc.yellow("⚠");
    case "info": return pc.blue("ℹ");
  }
}

/**
 * Get the worst severity from a list of warnings.
 */
function worstSeverity(warnings: CSSWarning[]): CSSWarning["severity"] {
  if (warnings.some((w) => w.severity === "error")) return "error";
  if (warnings.some((w) => w.severity === "warning")) return "warning";
  return "info";
}

/**
 * Format issue count with severity summary.
 */
function formatIssueCount(warnings: CSSWarning[]): string {
  const errors = warnings.filter((w) => w.severity === "error").length;
  const warns = warnings.filter((w) => w.severity === "warning").length;
  const infos = warnings.filter((w) => w.severity === "info").length;

  const parts: string[] = [];
  if (errors > 0) parts.push(pc.red(`${errors} err`));
  if (warns > 0) parts.push(pc.yellow(`${warns} warn`));
  if (infos > 0) parts.push(pc.blue(`${infos} info`));

  return parts.join(", ") || pc.green("none");
}

/**
 * Print the compatibility score table to terminal.
 */
export function printScoreTable(
  scores: Record<string, { score: number; errors: number; warnings: number; info: number }>,
  warnings: CSSWarning[],
  options?: { quiet?: boolean }
): void {
  if (!options?.quiet) {
    console.log();
    console.log(pc.bold("  Emailens: Compatibility Report"));
    console.log();
  }

  const clientMap = new Map(EMAIL_CLIENTS.map((c) => [c.id, c.name]));

  // Group warnings by client
  const warningsByClient = new Map<string, CSSWarning[]>();
  for (const w of warnings) {
    const existing = warningsByClient.get(w.client) ?? [];
    existing.push(w);
    warningsByClient.set(w.client, existing);
  }

  // Score table
  const table = new Table({
    head: [pc.bold("Client"), pc.bold("Score"), pc.bold("Issues")],
    style: { head: [], border: [] },
  });

  const sortedClients = Object.entries(scores).sort(([, a], [, b]) => a.score - b.score);

  for (const [clientId, { score }] of sortedClients) {
    const clientWarnings = warningsByClient.get(clientId) ?? [];
    table.push([
      clientMap.get(clientId) ?? clientId,
      colorScore(score),
      formatIssueCount(clientWarnings),
    ]);
  }

  console.log(table.toString());

  // Overall score
  const scoreValues = Object.values(scores);
  const overall = scoreValues.length > 0
    ? Math.round(scoreValues.reduce((a, b) => a + b.score, 0) / scoreValues.length)
    : 0;

  console.log();
  console.log(`  Overall: ${colorScore(overall)}/100`);
  console.log();
}

/**
 * Where the warning fires: the first position, and how many others share it.
 * Empty for compiled sources and document-level findings, which have none.
 */
function formatWhere(w: CSSWarning): string {
  if (!w.loc) return "";
  const more = (w.locs?.length ?? 1) - 1;
  const extra = more > 0 ? ` +${more}${w.locsTruncated ? "+" : ""} more` : "";
  return pc.dim(` (${w.loc.line}:${w.loc.column}${extra})`);
}

/**
 * Print detailed warnings grouped by client.
 */
export function printWarnings(
  warnings: CSSWarning[],
  options?: { quiet?: boolean }
): void {
  if (warnings.length === 0) {
    if (!options?.quiet) {
      console.log(pc.green("  No compatibility issues found."));
      console.log();
    }
    return;
  }

  // Group by client
  const byClient = new Map<string, CSSWarning[]>();
  for (const w of warnings) {
    const existing = byClient.get(w.client) ?? [];
    existing.push(w);
    byClient.set(w.client, existing);
  }

  const clientMap = new Map(EMAIL_CLIENTS.map((c) => [c.id, c.name]));

  for (const [clientId, clientWarnings] of byClient) {
    const clientName = clientMap.get(clientId) ?? clientId;
    const worst = worstSeverity(clientWarnings);
    console.log(`  ${severityIcon(worst)} ${pc.bold(clientName)} (${clientWarnings.length} issue${clientWarnings.length === 1 ? "" : "s"})`);

    for (const w of clientWarnings) {
      const prop = pc.dim(w.property);
      console.log(`    ${severityIcon(w.severity)} ${prop}${formatWhere(w)}: ${w.message}`);
      if (w.suggestion) {
        console.log(`      ${pc.dim("→")} ${w.suggestion}`);
      }
    }
    console.log();
  }
}
