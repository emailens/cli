import { describe, expect, test } from "bun:test";
import { EMAIL_CLIENTS } from "@emailens/engine";
import { resolveClients, resolveFormat, toFramework } from "../utils.js";

describe("resolveClients", () => {
  test("no argument means every client", () => {
    expect(resolveClients()).toEqual(EMAIL_CLIENTS.map((c) => c.id));
  });

  test("a comma list is parsed and whitespace tolerated", () => {
    expect(resolveClients("gmail-web, outlook-windows-legacy")).toEqual([
      "gmail-web",
      "outlook-windows-legacy",
    ]);
  });

  test("an unknown id throws and names it", () => {
    // Silently dropping a typo'd client is worse than failing: the user would
    // get a green run that never checked the client they cared about.
    expect(() => resolveClients("gmail-web,gmial-web")).toThrow(/gmial-web/);
  });

  test("empty segments are ignored, not treated as an unknown client", () => {
    expect(resolveClients("gmail-web,,")).toEqual(["gmail-web"]);
  });
});

describe("resolveFormat", () => {
  test("an explicit flag wins over the file extension", () => {
    expect(resolveFormat("mjml", "email.html")).toBe("mjml");
  });

  test("an unknown format throws rather than silently defaulting to html", () => {
    expect(() => resolveFormat("nunjucks")).toThrow(/nunjucks/);
  });

  test("the extension is used when no flag is given", () => {
    expect(resolveFormat(undefined, "welcome.mjml")).toBe("mjml");
    expect(resolveFormat(undefined, "welcome.jsx")).toBe("jsx");
  });

  test("stdin with no flag falls back to html", () => {
    expect(resolveFormat(undefined, "-")).toBe("html");
  });

  test("no flag and no path falls back to html", () => {
    expect(resolveFormat()).toBe("html");
  });
});

describe("toFramework", () => {
  test("html has no framework: it is not a compile target", () => {
    expect(toFramework("html")).toBeUndefined();
  });

  test("compiled formats map to themselves", () => {
    expect(toFramework("jsx")).toBe("jsx");
    expect(toFramework("mjml")).toBe("mjml");
    expect(toFramework("maizzle")).toBe("maizzle");
  });
});
