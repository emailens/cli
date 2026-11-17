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
// Keep each long-poll below the app proxy's request timeout. The CLI's overall
// timeout is separate and spans repeated polls.
const SERVER_WAIT_SECONDS = 20;

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
  ambiguous?: boolean;
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
  /** Overall seconds; each request waits at most SERVER_WAIT_SECONDS. */
  timeout: number;
  failOn: FailOn;
  testId?: string;
  runId?: string;
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
      timeout: String(
        Math.max(
          1,
          Math.min(
            SERVER_WAIT_SECONDS,
            Math.ceil((deadline - Date.now()) / 1000),
          ),
        ),
      ),
    });
    if (o.subject) q.set("subject", o.subject);
    if (o.sender) q.set("sender", o.sender);
    if (o.inbox) q.set("inboxId", o.inbox);
    if (o.testId) q.set("testId", o.testId);
    if (o.runId) q.set("runId", o.runId);
    let res: Response;
    try {
      res = await fetchImpl(`${API_URL()}/api/sandbox/v1/messages/wait?${q}`, {
        headers: { Authorization: `Bearer ${o.apiKey}` },
      });
    } catch (e) {
      return { code: 2, error: `Could not reach Emailens: ${(e as Error).message}`, failures: [] };
    }
    if ([408, 502, 503, 504].includes(res.status)) continue;
    const body = (await res.json().catch(() => ({}))) as WaitResponse;
    if (res.status === 401)
      return { code: 2, error: "Invalid or revoked API key (EMAILENS_API_KEY).", failures: [] };
    if (!res.ok) {
      if (body.ambiguous && o.testId && o.runId)
        return { code: 1, response: body, error: body.error, failures: [body.error ?? "More than one matching email arrived."] };
      return { code: 2, error: body.error ?? `Emailens answered ${res.status}.`, failures: [] };
    }
    const a = body.message?.analysis ?? {};
    const bad = (rows?: Row[]) => (rows ?? []).filter((r) => !r.ok).map((r) => r.text);
    const failures = o.testId && body.verdict
      ? body.verdict.reasons
      : [
      ...(o.failOn === "all" || o.failOn === "check" ? bad(a.match?.rows) : []),
      ...(o.failOn === "all" || o.failOn === "drift" ? bad(a.drift?.rows) : []),
      ];
    return { code: o.testId && body.verdict ? (body.verdict.pass ? 0 : 1) : failures.length ? 1 : 0, response: body, failures };
  }
  const error = `No matching email arrived within ${o.timeout}s.`;
  if (o.testId && o.runId) {
    try {
      await fetchImpl(`${API_URL()}/api/email-tests/${encodeURIComponent(o.testId)}/runs/${encodeURIComponent(o.runId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "timed_out", reasons: [error] }),
      });
    } catch { /* Keep timeout verdict even if history update is unreachable. */ }
  }
  return { code: 2, error, failures: [] };
}

const begin = defineCommand({
  meta: { name: "begin", description: "Start a saved email test run before your app sends the staging email" },
  args: {
    testId: { type: "positional", required: true, description: "Saved email test ID" },
    "api-key": { type: "string", description: "API key (default: EMAILENS_API_KEY)" },
    json: { type: "boolean", description: "Output run metadata as JSON" },
  },
  async run({ args }) {
    const apiKey = (args["api-key"] as string | undefined) ?? process.env.EMAILENS_API_KEY;
    const testId = args.testId as string | undefined;
    if (!apiKey || !testId) {
      console.error(pc.red("  Usage: emailens inbox begin <test-id> (set EMAILENS_API_KEY)."));
      process.exitCode = 2;
      return;
    }
    const metadata = {
      source: process.env.GITHUB_ACTIONS ? "github-action" : "cli",
      commitSha: process.env.GITHUB_SHA ?? process.env.GIT_COMMIT,
      branch: process.env.GITHUB_REF_NAME ?? process.env.GIT_BRANCH,
      environment: process.env.GITHUB_ENVIRONMENT ?? process.env.DEPLOY_ENVIRONMENT,
    };
    let response: Response;
    try {
      response = await fetch(`${API_URL()}/api/email-tests/${encodeURIComponent(testId)}/runs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
    } catch (e) {
      console.error(pc.red(`  Could not reach Emailens: ${(e as Error).message}`));
      process.exitCode = 2;
      return;
    }
    const body = await response.json().catch(() => ({})) as { run?: { id: string; startedAt: string }; error?: string };
    if (!response.ok || !body.run) {
      console.error(pc.red(`  ${body.error ?? `Emailens answered ${response.status}.`}`));
      process.exitCode = response.status === 401 ? 2 : 1;
      return;
    }
    const result = { testId, runId: body.run.id, startedAt: body.run.startedAt };
    if (args.json) console.log(JSON.stringify(result));
    else console.log(`  Started email test run ${result.runId}`);
  },
});

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
    test: { type: "string", description: "Saved test ID; pair with --run-id" },
    "run-id": { type: "string", description: "Run ID returned by inbox begin" },
    json: { type: "boolean", description: "Output as JSON" },
  },
  async run({ args }) {
    const apiKey = (args["api-key"] as string | undefined) ?? process.env.EMAILENS_API_KEY;
    const failOn = String(args["fail-on"]) as FailOn;
    if (!apiKey) {
      console.error(pc.red("  Set EMAILENS_API_KEY (or pass --api-key). Keys are at app.emailens.dev/dashboard/api."));
      process.exit(2);
    }
    if (Boolean(args.test) !== Boolean(args["run-id"])) {
      console.error(pc.red("  --test and --run-id must be provided together."));
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
      testId: args.test as string | undefined,
      runId: args["run-id"] as string | undefined,
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
  subCommands: { begin, wait },
});
