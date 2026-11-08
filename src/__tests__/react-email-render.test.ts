import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canRenderNatively, findEmailsDir, findTemplates, renderModule, renderTemplate, TemplateError } from "../react-email.js";

/** The renderer in process, where coverage can see it; react-email.test.ts drives the binary. */

const EMAILS = join(import.meta.dir, "fixtures", "react-email", "emails");
const SCRATCH = join(import.meta.dir, "fixtures", "react-email", "scratch");
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

describe("findTemplates", () => {
  test("walks subfolders and skips _ and static folders", () => {
    const rel = findTemplates(EMAILS).map((f) => f.slice(EMAILS.length + 1).split("\\").join("/"));
    expect(rel).toEqual(["billing/plan.tsx", "billing/receipt.tsx", "welcome.tsx"]);
  });
});

describe("findEmailsDir", () => {
  test("finds emails/ in a project, and nothing elsewhere", () => {
    expect(findEmailsDir(join(EMAILS, ".."))).toBe(EMAILS);
    expect(findEmailsDir(mkdtempSync(join(tmpdir(), "emailens-none-")))).toBeNull();
  });
  test("finds src/emails/", () => {
    const root = mkdtempSync(join(tmpdir(), "emailens-src-"));
    mkdirSync(join(root, "src", "emails"), { recursive: true });
    expect(findEmailsDir(root)).toBe(join(root, "src", "emails"));
  });
});

describe("renderTemplate", () => {
  test("renders with PreviewProps", async () => {
    expect(await renderTemplate(join(EMAILS, "welcome.tsx"))).toContain("ADA");
  });
  test("React Email 6 renders through react-email itself", () => {
    expect(renderModule(join(EMAILS, "welcome.tsx"))).toBe("react-email");
  });
  test("a React Email 5 template, components from @react-email/components, still renders", async () => {
    const legacy = join(import.meta.dir, "fixtures", "react-email-5", "emails", "legacy.tsx");
    expect(await renderTemplate(legacy)).toContain("Still renders");
  });
  test("a file without a default component is not an email", async () => {
    expect(await renderTemplate(join(EMAILS, "_components", "footer.tsx"))).toBeNull();
  });
  test("a syntax error and a throwing render both name the file", async () => {
    mkdirSync(SCRATCH, { recursive: true });
    const bad = join(SCRATCH, "bad.tsx");
    writeFileSync(bad, "export default function Bad() { return <p>; }\n");
    const boom = join(SCRATCH, "boom.tsx");
    writeFileSync(boom, `export default function Boom(): never { throw new Error("no data"); }\n`);
    for (const [file, reason] of [[bad, /./], [boom, /no data/]] as const) {
      const err = await renderTemplate(file).catch((e) => e);
      expect(err).toBeInstanceOf(TemplateError);
      expect(err.file).toBe(file);
      expect(err.reason).toMatch(reason);
    }
  });
  test("outside a React Email project it cannot render natively", () => {
    const lone = join(mkdtempSync(join(tmpdir(), "emailens-lone-")), "x.tsx");
    writeFileSync(lone, "export default () => null;\n");
    expect(canRenderNatively(lone)).toBe(false);
    expect(canRenderNatively(join(EMAILS, "welcome.tsx"))).toBe(true);
  });
});
