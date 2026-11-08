import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A React Email project linted the way its owner runs it: point at the emails
 * folder, nothing exported first. The fixture imports a local component, keeps
 * components in `_components`, nests a template in a subfolder and has a prop
 * with no default, which are the four things the sandboxed JSX path and the
 * `email export` route could not handle.
 */

const ENTRY = join(import.meta.dir, "..", "index.ts");
const PROJECT = join(import.meta.dir, "fixtures", "react-email");
const EMAILS = join(PROJECT, "emails");
const BROKEN = join(PROJECT, "broken");

async function cli(args: string[], cwd = process.cwd()) {
  const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
  const proc = Bun.spawn(["bun", ENTRY, ...args], { stdout: "pipe", stderr: "pipe", env, cwd });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode: await proc.exited, stdout, stderr };
}

type Json = { files: { file: string; issues: { rule: string; message: string }[] }[] };
const names = (j: Json) => j.files.map((f) => f.file.split("\\").join("/").replace(/^.*emails\//, "")).sort();

afterAll(() => rmSync(BROKEN, { recursive: true, force: true }));

describe("lint on a React Email folder", () => {
  test("renders every template in subfolders, and skips the components", async () => {
    const r = await cli(["lint", EMAILS, "--json"]);
    expect(r.stderr).toBe("");
    expect(names(JSON.parse(r.stdout))).toEqual(["billing/plan.tsx", "billing/receipt.tsx", "welcome.tsx"]);
  });

  test("renders with PreviewProps and resolves local imports", async () => {
    // welcome.tsx throws without PreviewProps and imports ./_components/footer.
    const r = await cli(["lint", join(EMAILS, "welcome.tsx"), "--json"]);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout).files).toHaveLength(1);
  });

  test("checks the rendered HTML: flex in the receipt is reported", async () => {
    const r = await cli(["lint", join(EMAILS, "billing", "receipt.tsx"), "--json"]);
    const issues = (JSON.parse(r.stdout) as Json).files[0].issues;
    expect(issues.some((i) => /flex|display|gap/i.test(`${i.rule} ${i.message}`))).toBe(true);
  });

  test("Tailwind classes are checked after React Email inlines them", async () => {
    const r = await cli(["lint", join(EMAILS, "billing", "plan.tsx"), "--json"]);
    const rules = (JSON.parse(r.stdout) as Json).files[0].issues.map((i) => i.rule);
    expect(rules).toContain("display:flex");
    expect(rules).toContain("gap");
  });

  test("a template that throws names the file and fails the run", async () => {
    mkdirSync(BROKEN, { recursive: true });
    writeFileSync(
      join(BROKEN, "boom.tsx"),
      `export default function Boom(): never { throw new Error("no data"); }\n`,
    );
    const r = await cli(["lint", BROKEN]);
    expect(r.exitCode).toBe(1);
    // One line naming the file and the reason, and no report on the fallback
    // HTML React returns after a component throws.
    expect(r.stderr).toMatch(/boom\.tsx: no data/);
    expect(r.stdout).not.toContain("boom.tsx");
  });
});

describe("emailens react-email", () => {
  test("finds the emails folder on its own", async () => {
    const r = await cli(["react-email", "--json"], PROJECT);
    expect(r.stderr).toBe("");
    expect(names(JSON.parse(r.stdout))).toEqual(["billing/plan.tsx", "billing/receipt.tsx", "welcome.tsx"]);
  });

  test("says where it looked when there is no emails folder", async () => {
    const r = await cli(["react-email"], import.meta.dir);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("emails");
  });
});

describe("React Email's /static images", () => {
  const STATIC = join(PROJECT, "static-img");
  afterAll(() => rmSync(STATIC, { recursive: true, force: true }));

  test("says they load only in the preview server", async () => {
    mkdirSync(STATIC, { recursive: true });
    writeFileSync(
      join(STATIC, "logo.tsx"),
      `import { Html, Img } from "react-email";
export default function Logo() { return <Html><Img src="/static/logo.png" alt="Acme" width="80" height="20" /></Html>; }
`,
    );
    const r = await cli(["lint", STATIC]);
    expect(r.stdout).toContain("preview server");
  });
});

describe("transactional email", () => {
  const TX = join(PROJECT, "tx");
  afterAll(() => rmSync(TX, { recursive: true, force: true }));
  const unsub = (r: { stdout: string }) =>
    (JSON.parse(r.stdout) as Json).files[0].issues.filter((i) => i.rule === "missing-unsubscribe");

  test("--email-type transactional drops the unsubscribe requirement; without it, a hint says how", async () => {
    mkdirSync(TX, { recursive: true });
    writeFileSync(
      join(TX, "login.tsx"),
      `import { Html, Text } from "react-email";
export default function Login() { return <Html><Text>Log in with this link.</Text></Html>; }
`,
    );
    expect(unsub(await cli(["lint", TX, "--json"]))).toHaveLength(1);
    expect((await cli(["lint", TX])).stdout).toContain("--email-type transactional");
    expect(unsub(await cli(["lint", TX, "--json", "--email-type", "transactional"]))).toHaveLength(0);
  });

  test("emailType in .emailensrc does the same", async () => {
    writeFileSync(join(TX, ".emailensrc"), JSON.stringify({ emailType: "transactional" }));
    expect(unsub(await cli(["lint", "login.tsx", "--json"], TX))).toHaveLength(0);
  });
});
