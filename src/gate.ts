/**
 * The hosted pre-send gate, called once per email from `lint --gate`. What an
 * offline lint cannot do: compare against the last version of this email that
 * passed (stored server-side under `ref`), so a change that breaks Outlook
 * fails even when the score stays above the threshold. Pro plan.
 */

const API_URL = () => process.env.EMAILENS_API_URL ?? "https://app.emailens.dev";

interface GateFailure {
  family: string;
  check: string;
  clientId?: string;
  score?: number;
  threshold?: number;
}

export interface GateOutcome {
  ref: string;
  passed: boolean;
  /** One line: why it failed, or that it passed. */
  summary: string;
}

const describe = (f: GateFailure): string => {
  if (f.check === "worse-than-baseline") return "worse than the last version that passed";
  if (f.check === "threshold") return `${f.clientId} scores ${f.score}, below ${f.threshold}`;
  if (f.check === "client-errors") return `${f.clientId} has errors`;
  return `${f.family}: ${f.check}`;
};

export async function gateEmail(
  html: string,
  ref: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GateOutcome> {
  // A gate the run asked for and could not reach fails: a green build that
  // skipped its gate is the silent pass this flag exists to prevent.
  const fail = (summary: string): GateOutcome => ({ ref, passed: false, summary });
  let res: Response;
  try {
    res = await fetchImpl(`${API_URL()}/api/gate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ html, ref }),
    });
  } catch (e) {
    return fail(`could not reach Emailens: ${(e as Error).message}`);
  }
  const body = (await res.json().catch(() => ({}))) as {
    passed?: boolean;
    failures?: GateFailure[];
    code?: string;
    error?: string;
  };
  if (res.status === 401) return fail("invalid or revoked API key (EMAILENS_API_KEY)");
  if (res.status === 403) return fail("the gate needs an API key on the Pro plan");
  if (!res.ok) return fail(body.error ?? `Emailens answered ${res.status}`);
  if (body.passed) return { ref, passed: true, summary: "passed" };
  return fail((body.failures ?? []).map(describe).join("; ") || "failed");
}
