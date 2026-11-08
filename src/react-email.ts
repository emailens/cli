import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * React Email templates rendered the way the project renders them: with the
 * project's own esbuild, React and @react-email/render, so local imports, any
 * npm package, tsconfig paths and PreviewProps all work. The sandboxed JSX
 * compile in the engine exists for code from strangers (the API, agents); a
 * developer linting their own repo is running their own code anyway.
 */

const TEMPLATE = /\.(tsx|jsx)$/;

/** Folders React Email's preview server does not list as emails. */
const skipDir = (name: string) => name.startsWith("_") || name.startsWith(".") || name === "node_modules" || name === "static";

/** Every .tsx/.jsx under `dir`, sorted. Whether it is an email is decided at render. */
export function findTemplates(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!skipDir(e.name)) out.push(...findTemplates(join(dir, e.name)));
    } else if (TEMPLATE.test(e.name)) {
      out.push(join(dir, e.name));
    }
  }
  return out.sort();
}

export const EMAIL_DIRS = ["emails", "src/emails", "react-email/emails", "src/react-email/emails"];

/** The emails folder of the project in `cwd`, where `email dev` would look. */
export function findEmailsDir(cwd = process.cwd()): string | null {
  for (const d of EMAIL_DIRS) {
    const p = resolve(cwd, d);
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

type Esbuild = { build(o: Record<string, unknown>): Promise<unknown> };

/**
 * The project's esbuild, or null. React Email's own CLI depends on it, so a
 * project with `react-email` installed has one even under pnpm, where it is
 * only reachable from the react-email package.
 */
function projectEsbuild(file: string): Esbuild | null {
  const req = createRequire(file);
  for (const from of [file, "react-email/package.json"]) {
    try {
      const base = from === file ? req : createRequire(req.resolve(from));
      return base("esbuild") as Esbuild;
    } catch {}
  }
  return null;
}

/**
 * Which package exports `render` in this project. React Email 6 exports it
 * from react-email itself, which under pnpm is the only one in reach; before
 * 6, react-email was the CLI alone and render came from @react-email/*.
 */
export function renderModule(file: string): string | null {
  const req = createRequire(file);
  try {
    const { version } = req("react-email/package.json") as { version: string };
    if (Number.parseInt(version, 10) >= 6) return "react-email";
  } catch {}
  for (const m of ["@react-email/render", "@react-email/components"]) {
    try {
      req.resolve(m);
      return m;
    } catch {}
  }
  return null;
}

/** True when `file` can be rendered natively: its project has esbuild and React Email. */
export function canRenderNatively(file: string): boolean {
  return projectEsbuild(file) !== null && renderModule(file) !== null;
}

/** Thrown when a template fails to build or render, naming the file. */
export class TemplateError extends Error {
  constructor(readonly file: string, readonly reason: string) {
    super(`${file}: ${reason}`);
  }
}

/**
 * Render one template to HTML, or null when it has no default-exported
 * component (a shared component that sits next to the emails).
 */
export async function renderTemplate(file: string): Promise<string | null> {
  const esbuild = projectEsbuild(file);
  const render = renderModule(file);
  if (!esbuild || !render) throw new TemplateError(file, "esbuild and @react-email/render must be installed in the project");

  // One self-contained CommonJS bundle, React included, so the component and
  // render() share a single React and nothing resolves from the temp folder.
  const entry = `
    import * as mod from ${JSON.stringify(resolve(file))};
    import { render } from ${JSON.stringify(render)};
    import { createElement } from "react";
    const Email = mod.default;
    // ponytail: React's server renderer logs a component's error and still
    // resolves, with fallback HTML. The logged Error is the only trace, so it
    // is caught here and rethrown; other console.error output passes through.
    module.exports = typeof Email === "function"
      ? async () => {
          let caught;
          const log = console.error;
          console.error = (...a) => {
            const e = a.find((x) => x instanceof Error);
            if (e) caught ??= e;
            else log(...a);
          };
          try {
            const html = await render(createElement(Email, Email.PreviewProps ?? {}));
            if (caught) throw caught;
            return html;
          } finally {
            console.error = log;
          }
        }
      : null;
  `;
  const tmp = mkdtempSync(join(tmpdir(), "emailens-re-"));
  const out = join(tmp, "email.cjs");
  try {
    try {
      await esbuild.build({
        stdin: { contents: entry, resolveDir: dirname(resolve(file)), loader: "tsx", sourcefile: "emailens-entry.tsx" },
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: out,
        // A Next.js tsconfig says "preserve", which would leave JSX untouched.
        jsx: "automatic",
        loader: { ".css": "empty", ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl", ".gif": "dataurl" },
        define: { "process.env.NODE_ENV": '"production"' },
        logLevel: "silent",
      });
    } catch (err) {
      const e = err as { errors?: { text: string }[] };
      throw new TemplateError(file, e.errors?.[0]?.text ?? (err as Error).message);
    }
    const run = createRequire(out)(out) as null | (() => Promise<string> | string);
    if (!run) return null;
    try {
      return await run();
    } catch (err) {
      throw new TemplateError(file, (err as Error).message);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
