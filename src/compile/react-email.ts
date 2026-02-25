import { createContext, Script } from "node:vm";

/** Maximum source code size: 256KB */
const MAX_SOURCE_SIZE = 256_000;

/** Execution timeout: 5 seconds */
const EXECUTION_TIMEOUT_MS = 5_000;

/**
 * Compile a React Email JSX/TSX source string into an HTML email string.
 *
 * Ported from the webapp compiler, simplified for CLI use.
 * Uses sucrase for JSX transpilation and vm sandbox for safe execution.
 * Requires: sucrase, react, @react-email/components, @react-email/render
 */
export async function compileReactEmail(source: string): Promise<string> {
  // ── Validate ──────────────────────────────────────────────────────
  if (!source || !source.trim()) {
    throw new Error("JSX source must not be empty.");
  }

  if (source.length > MAX_SOURCE_SIZE) {
    throw new Error(`JSX source exceeds ${MAX_SOURCE_SIZE / 1000}KB limit.`);
  }

  // ── Load optional dependencies ────────────────────────────────────
  let transform: typeof import("sucrase").transform;
  let React: typeof import("react");
  let ReactEmailComponents: typeof import("@react-email/components");
  let render: typeof import("@react-email/render").render;

  try {
    ({ transform } = await import("sucrase"));
  } catch {
    throw new Error(
      'JSX compilation requires "sucrase". Install it:\n  npm install sucrase'
    );
  }

  try {
    React = await import("react");
  } catch {
    throw new Error(
      'JSX compilation requires "react". Install it:\n  npm install react'
    );
  }

  try {
    ReactEmailComponents = await import("@react-email/components");
  } catch {
    throw new Error(
      'JSX compilation requires "@react-email/components". Install it:\n  npm install @react-email/components'
    );
  }

  try {
    ({ render } = await import("@react-email/render"));
  } catch {
    throw new Error(
      'JSX compilation requires "@react-email/render". Install it:\n  npm install @react-email/render'
    );
  }

  // ── Transpile JSX/TSX → CommonJS ──────────────────────────────────
  let transpiledCode: string;
  try {
    const result = transform(source, {
      transforms: ["typescript", "jsx", "imports"],
      jsxRuntime: "classic",
      production: true,
    });
    transpiledCode = result.code;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown transpilation error";
    throw new Error(`JSX syntax error: ${message}`);
  }

  // ── Execute in sandbox ────────────────────────────────────────────
  const ALLOWED_MODULES: Record<string, unknown> = {
    react: React,
    "@react-email/components": ReactEmailComponents,
  };

  const moduleExports: Record<string, unknown> = {};
  const moduleObj = { exports: moduleExports };

  const mockRequire = (moduleName: string): unknown => {
    if (moduleName in ALLOWED_MODULES) {
      return ALLOWED_MODULES[moduleName];
    }
    throw new Error(
      `Import of "${moduleName}" is not allowed. ` +
        `Only "react" and "@react-email/components" can be imported.`
    );
  };

  const sandbox: Record<string, unknown> = {
    module: moduleObj,
    exports: moduleExports,
    require: mockRequire,
    React,
    Object, Array, String, Number, Boolean,
    Map, Set, WeakMap, WeakSet,
    JSON, Math, Date, RegExp,
    Error, TypeError, RangeError, ReferenceError, SyntaxError, URIError,
    Promise, Symbol, Proxy, Reflect,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    undefined, NaN, Infinity,
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout: undefined, setInterval: undefined, setImmediate: undefined, queueMicrotask: undefined,
    process: undefined, globalThis: undefined, global: undefined, Buffer: undefined,
    __dirname: undefined, __filename: undefined,
  };

  const context = createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  try {
    const script = new Script(transpiledCode, { filename: "user-email-component.tsx" });
    script.runInContext(context, { timeout: EXECUTION_TIMEOUT_MS, displayErrors: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown execution error";
    if (message.includes("Script execution timed out")) {
      throw new Error("JSX execution timed out (possible infinite loop).");
    }
    throw new Error(`JSX execution error: ${message}`);
  }

  // ── Extract component and render ──────────────────────────────────
  let Component: unknown = moduleObj.exports.default ?? moduleObj.exports;

  if (typeof Component !== "function" && typeof Component === "object" && Component !== null) {
    const values = Object.values(Component as Record<string, unknown>);
    const fn = values.find((v) => typeof v === "function");
    if (fn) Component = fn;
  }

  if (typeof Component !== "function") {
    throw new Error(
      'The JSX source must export a React component function. ' +
        'Use "export default function Email() { ... }" or ' +
        '"export function Email() { ... }".'
    );
  }

  try {
    const element = React.createElement(Component as () => unknown);
    const html = await render(element);
    return html;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown rendering error";
    throw new Error(`React rendering error: ${message}`);
  }
}
