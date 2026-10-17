import { defineCommand } from "citty";
import pc from "picocolors";

/**
 * `emailens inbox wait`: the CI step of the test inbox. Your pipeline makes
 * your app send a real email to your Emailens test inbox; this waits for it
 * and fails when it is no longer the email you checked, or changed since the
 * last time it arrived (a link moved to staging, an emptied variable,
 * signing that stopped passing). Codes, tokens and tracking ids differ on
 * every send and are not changes.
 */

const API_URL = () => process.env.EMAILENS_API_URL ?? "https://app.emailens.dev";

export type FailOn = "all" | "check" | "drift" | "none";

interface Row {
  ok: boolean;
  text: string;
}
interface WaitResponse {
  message?: {
    id: string;
    subject: string;
    sender: string;
    receivedAt: string;
    analysis?: {
      match?: { line: string; rows: Row[] } | null;
      drift?: { line: string; rows: Row[] } | null;
    };
  };
  verdict?: { pass: boolean; reasons: string[]; checked: string; sinceLast: string };
  error?: string;
}

/** `--since`: an ISO time, epoch milliseconds, or a duration back from now (90s, 5m, 1h). */
export function parseSince(value: string | undefined, now = Date.now()): number {
  if (!value) return now - 2 * 60_000;
  const d = /^(\d+)\s*(s|m|h)$/i.exec(value.trim());
  if (d) return now - Number(d[1]) * { s: 1_000, m: 60_000, h: 3_600_000 }[d[2].toLowerCase() as "s" | "m" | "h"];
  if (/^\d+$/.test(value)) return Number(value);
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new Error(`--since: not a time or a duration: ${value}`);
  return t;
}

export interface WaitOptions {
  apiKey: string;
  subject?: string;
  sender?: string;
  inbox?: string;
  since: number;
  /** Overall seconds; each request waits at most 60 on the server. */
  timeout: number;
  failOn: FailOn;
}

export interface WaitResult {
  /** 0 pass, 1 fail, 2 timed out or could not ask. */
  code: 0 | 1 | 2;
  response?: WaitResponse;
  error?: string;
  failures: string[];
}

export async function waitForEmail(
  o: WaitOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<WaitResult> {
  const deadline = Date.now() + o.timeout * 1000;
  while (Date.now() < deadline) {
    const q = new URLSearchParams({
      since: String(o.since),
      timeout: String(Math.max(1, Math.min(60, Math.ceil((deadline - Date.now()) / 1000)))),
    });
    if (o.subject) q.set("subject", o.subject);
    if (o.sender) q.set("sender", o.sender);
    if (o.inbox) q.set("inboxId", o.inbox);
    let res: Response;
    try {
      res = await fetchImpl(`${API_URL()}/api/sandbox/v1/messages/wait?${q}`, {
        headers: { Authorization: `Bearer ${o.apiKey}` },
      });
    } catch (e) {
      return { code: 2, error: `Could not reach Emailens: ${(e as Error).message}`, failures: [] };
    }
    if (res.status === 408) continue;
    const body = (await res.json().catch(() => ({}))) as WaitResponse;
    if (res.status === 401)
      return { code: 2, error: "Invalid or revoked API key (EMAILENS_API_KEY).", failures: [] };
    if (!res.ok) return { code: 2, error: body.error ?? `Emailens answered ${res.status}.`, failures: [] };
    const a = body.message?.analysis ?? {};
    const bad = (rows?: Row[]) => (rows ?? []).filter((r) => !r.ok).map((r) => r.text);
    const failures = [
      ...(o.failOn === "all" || o.failOn === "check" ? bad(a.match?.rows) : []),
      ...(o.failOn === "all" || o.failOn === "drift" ? bad(a.drift?.rows) : []),
    ];
    return { code: failures.length ? 1 : 0, response: body, failures };
  }
  return { code: 2, error: `No matching email arrived within ${o.timeout}s.`, failures: [] };
}

const wait = defineCommand({
  meta: {
    name: "wait",
    description:
      "Wait for an email your app sent to your test inbox; fail if it is no longer the email you checked, or changed since it last arrived",
  },
  args: {
    subject: { type: "string", description: "Part of the subject to wait for (case-insensitive)" },
    sender: { type: "string", description: "Part of the sender to wait for" },
    inbox: { type: "string", description: "Inbox id (default: any of your inboxes)" },
    since: {
      type: "string",
      description: "Only mail after this: ISO time, epoch ms, or a duration back (default 2m)",
    },
    timeout: { type: "string", description: "Seconds to wait (default 60, at most 600)", default: "60" },
    "fail-on": {
      type: "string",
      description: "What fails the step: all (default), check, drift, none",
      default: "all",
    },
    "api-key": { type: "string", description: "API key (default: EMAILENS_API_KEY)" },
    json: { type: "boolean", description: "Output as JSON" },
  },
  async run({ args }) {
    const apiKey = (args["api-key"] as string | undefined) ?? process.env.EMAILENS_API_KEY;
    const failOn = String(args["fail-on"]) as FailOn;
    if (!apiKey) {
      console.error(pc.red("  Set EMAILENS_API_KEY (or pass --api-key). Keys are at app.emailens.dev/dashboard/api."));
      process.exit(2);
    }
    if (!["all", "check", "drift", "none"].includes(failOn)) {
      console.error(pc.red(`  --fail-on: all, check, drift or none, not ${failOn}.`));
      process.exit(2);
    }
    let since: number;
    try {
      since = parseSince(args.since as string | undefined);
    } catch (e) {
      console.error(pc.red(`  ${(e as Error).message}`));
      process.exit(2);
    }
    const result = await waitForEmail({
      apiKey,
      subject: args.subject as string | undefined,
      sender: args.sender as string | undefined,
      inbox: args.inbox as string | undefined,
      since,
      timeout: Math.min(600, Math.max(1, Number(args.timeout) || 60)),
      failOn,
    });

    if (args.json) {
      console.log(
        JSON.stringify(
          {
            pass: result.code === 0,
            code: result.code,
            error: result.error,
            failures: result.failures,
            message: result.response?.message
              ? {
                  id: result.response.message.id,
                  subject: result.response.message.subject,
                  sender: result.response.message.sender,
                  receivedAt: result.response.message.receivedAt,
                }
              : undefined,
            verdict: result.response?.verdict,
          },
          null,
          2,
        ),
      );
      process.exitCode = result.code;
      return;
    }

    console.log();
    if (result.error) {
      console.log(`  ${pc.red("✗")} ${result.error}`);
      console.log();
      process.exitCode = result.code;
      return;
    }
    const m = result.response?.message;
    const v = result.response?.verdict;
    console.log(`  ${pc.bold(m?.subject ?? "")} ${pc.dim(`from ${m?.sender ?? ""}`)}`);
    console.log();
    console.log(`  ${pc.dim("Your check")}       ${v?.checked ?? ""}`);
    console.log(`  ${pc.dim("Since last time")}  ${v?.sinceLast ?? ""}`);
    if (result.failures.length) {
      console.log();
      for (const f of result.failures) console.log(`  ${pc.red("✗")} ${f}`);
    }
    console.log();
    console.log(
      result.code === 0
        ? `  ${pc.green("✓ Pass")}`
        : `  ${pc.red(`✗ Fail: ${result.failures.length} change${result.failures.length === 1 ? "" : "s"}`)}`,
    );
    console.log();
    // exitCode, not exit(): exiting while the HTTP connection closes crashes
    // Node on Windows (a libuv assertion, exit 127), which CI would misread.
    process.exitCode = result.code;
  },
});

export default defineCommand({
  meta: {
    name: "inbox",
    description: "Your Emailens test inbox, from CI",
  },
  subCommands: { wait },
});
