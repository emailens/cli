import { describe, expect, test } from "bun:test";
import { parseSince, waitForEmail } from "../commands/inbox.js";

const now = Date.parse("2026-10-17T12:00:00Z");

describe("--since", () => {
  test("a duration back from now", () => {
    expect(parseSince("5m", now)).toBe(now - 300_000);
    expect(parseSince("90s", now)).toBe(now - 90_000);
  });
  test("epoch ms and ISO", () => {
    expect(parseSince("1760702400000", now)).toBe(1760702400000);
    expect(parseSince("2026-10-17T11:00:00Z", now)).toBe(now - 3_600_000);
  });
  test("defaults to two minutes back", () => expect(parseSince(undefined, now)).toBe(now - 120_000));
  test("rejects nonsense", () => expect(() => parseSince("yesterday-ish", now)).toThrow());
});

const answer = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const opts = { apiKey: "k", since: now, timeout: 5, failOn: "all" as const };
const drifted = {
  message: {
    id: "m",
    subject: "Welcome",
    sender: "Acme",
    receivedAt: "",
    analysis: {
      match: null,
      drift: { line: "", rows: [{ ok: false, text: "DKIM passed last time, is fail now." }] },
    },
  },
  verdict: { pass: false, reasons: [], checked: "", sinceLast: "" },
};

describe("inbox wait", () => {
  test("a change since the last send fails the step with the reason", async () => {
    const r = await waitForEmail(opts, answer(200, drifted));
    expect(r.code).toBe(1);
    expect(r.failures).toEqual(["DKIM passed last time, is fail now."]);
  });
  test("--fail-on check ignores drift", async () => {
    const r = await waitForEmail({ ...opts, failOn: "check" }, answer(200, drifted));
    expect(r.code).toBe(0);
  });
  test("a bad key is an error, not a pass", async () => {
    const r = await waitForEmail(opts, answer(401, {}));
    expect(r.code).toBe(2);
  });
  test("nothing arriving is an error", async () => {
    const r = await waitForEmail({ ...opts, timeout: 1 }, answer(408, {}));
    expect(r.code).toBe(2);
  });
});
