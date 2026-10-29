import { describe, expect, test } from "bun:test";
import { expectEmailToPass } from "../test.js";

const CLEAN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hi</title></head><body>
<table role="presentation" width="100%"><tr><td style="font-family:Arial,sans-serif;color:#111111;background:#ffffff">
<p>Thanks for signing up. Your account is ready, and you can sign in any time from the link below.</p>
<p><a href="https://example.com/login">Sign in to your account</a></p>
<p>Example Inc, 1 Main Street, Springfield. <a href="https://example.com/unsubscribe">Unsubscribe</a></p>
</td></tr></table></body></html>`;

describe("expectEmailToPass", () => {
  test("throws with each failing finding and its line", () => {
    expect(() => expectEmailToPass(`<html><body><img src="a.png"></body></html>`)).toThrow(
      /^Email fails emailens lint \(\d+\):\n[^]*\n {2}error +1:13 accessibility img-missing-alt: /,
    );
  });

  test("passes a clean email and returns the findings", () => {
    expect(Array.isArray(expectEmailToPass(CLEAN))).toBe(true);
  });

  test("skip turns a check off", () => {
    expect(() => expectEmailToPass(`<html lang="en"><body><p>hi</p></body></html>`, { skip: ["spam", "accessibility", "inboxPreview", "size", "links", "images", "design", "visual"] })).not.toThrow();
  });
});
