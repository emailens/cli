import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/test.ts"],
  format: ["esm"],
  // src/test.ts restates its public types, so no engine type leaks into them.
  dts: { entry: "src/test.ts" },
  sourcemap: false,
  clean: true,
  outDir: "dist",
  target: "node18",
  // One file for npx: every dependency is bundled, so a cold `npx @emailens/cli`
  // fetches one package instead of ~48 (20 s on a slow line, 2026-10-31).
  // Only the optional peers stay out: they load when a command needs them.
  // (noExternal wins over external, so the peers are left out of the pattern.)
  noExternal: [/^(?!playwright-core|@anthropic-ai\/|isolated-vm|sucrase|react($|\/)|@react-email\/|mjml|@maizzle\/)/],
  external: ["playwright-core", "@anthropic-ai/sdk", "isolated-vm", "sucrase", "react", "@react-email/components", "@react-email/render", "mjml", "@maizzle/framework"],
  esbuildOptions(options) {
    // css-tree reads its data JSON from disk at runtime; its prebuilt module
    // carries the data inline, so the bundle stands alone.
    options.alias = { "css-tree": "css-tree/dist/csstree.esm" };
  },
  banner: {
    // Bundled CommonJS dependencies (iconv-lite and friends) call require().
    // The shebang sits in src/index.ts, which keeps it on the bin alone: on a
    // shared chunk it broke Vitest, which prepends a line to the file.
    js: 'import { createRequire as __cr } from "node:module";\nconst require = __cr(import.meta.url);',
  },
});
