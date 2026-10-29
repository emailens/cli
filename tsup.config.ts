import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/test.ts"],
  format: ["esm"],
  dts: { entry: "src/test.ts" },
  sourcemap: true,
  clean: true,
  outDir: "dist",
  target: "node18",
  external: ["playwright-core", "sucrase", "react", "@react-email/components", "@react-email/render", "mjml", "@maizzle/framework"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
