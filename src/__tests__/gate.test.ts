import { describe, expect, test } from "bun:test";
import { gateEmail } from "../gate.js";

const reply = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("gateEmail", () => {
  test("sends the html under its ref with the key, and passes on a pass", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ passed: true, failures: [], baseline: { comparedTo: null } }));
    }) as unknown as typeof fetch;
    const g = await gateEmail("<p>hi</p>", "emails/welcome.tsx", "ek_test", f);
    expect(g.passed).toBe(true);
    expect(sent!.url).toEndWith("/api/gate");
    expect(JSON.parse(String(sent!.init.body))).toEqual({ html: "<p>hi</p>", ref: "emails/welcome.tsx" });
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe("Bearer ek_test");
  });

  test("names the failing client and score", async () => {
    const g = await gateEmail("<p/>", "r", "k", reply(200, {
      passed: false,
      failures: [{ family: "compatibility", check: "threshold", clientId: "outlook-windows", score: 43, threshold: 70 }],
    }));
    expect(g.passed).toBe(false);
    expect(g.summary).toContain("outlook-windows");
    expect(g.summary).toContain("43");
  });

  test("a client with errors is named", async () => {
    const g = await gateEmail("<p/>", "r", "k", reply(200, {
      passed: false,
      failures: [{ family: "compatibility", check: "client-errors", clientId: "outlook-windows" }],
    }));
    expect(g.summary).toBe("outlook-windows has errors");
  });

  test("a regression says so", async () => {
    const g = await gateEmail("<p/>", "r", "k", reply(200, {
      passed: false,
      failures: [{ family: "regression", check: "worse-than-baseline" }],
    }));
    expect(g.summary).toContain("worse than the last version that passed");
  });

  test("a gate it could not ask fails, with the reason", async () => {
    expect((await gateEmail("<p/>", "r", "k", reply(403, { code: "plan_required" }))).summary).toContain("Pro");
    expect((await gateEmail("<p/>", "r", "k", reply(401, {}))).summary).toContain("API key");
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const g = await gateEmail("<p/>", "r", "k", down);
    expect(g.passed).toBe(false);
    expect(g.summary).toContain("ECONNREFUSED");
  });
});
