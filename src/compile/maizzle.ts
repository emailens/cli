/** Maximum Maizzle source size: 512KB */
const MAX_SOURCE_SIZE = 512_000;

/** Compilation timeout: 15 seconds */
const COMPILE_TIMEOUT_MS = 15_000;

/**
 * Compile a Maizzle template string into an HTML email string.
 * Requires: @maizzle/framework (optional peer dependency)
 *
 * No dangerous-directive check in CLI — runs locally on the user's machine.
 */
export async function compileMaizzle(source: string): Promise<string> {
  // ── Validate ──────────────────────────────────────────────────────
  if (!source || !source.trim()) {
    throw new Error("Maizzle source must not be empty.");
  }

  if (source.length > MAX_SOURCE_SIZE) {
    throw new Error(`Maizzle source exceeds ${MAX_SOURCE_SIZE / 1000}KB limit.`);
  }

  // ── Load optional dependency ──────────────────────────────────────
  let maizzleRender: (input: string, options: Record<string, unknown>) => Promise<{ html: string }>;
  try {
    const maizzle = await import("@maizzle/framework");
    maizzleRender = maizzle.render;
  } catch {
    throw new Error(
      'Maizzle compilation requires "@maizzle/framework". Install it:\n  npm install @maizzle/framework'
    );
  }

  // ── Compile with timeout ──────────────────────────────────────────
  const compilePromise = maizzleRender(source, {
    css: {
      inline: {
        removeInlinedSelectors: true,
        applyWidthAttributes: true,
        applyHeightAttributes: true,
      },
      shorthand: true,
      sixHex: true,
    },
    locals: {},
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`Maizzle compilation timed out after ${COMPILE_TIMEOUT_MS / 1000}s.`));
    }, COMPILE_TIMEOUT_MS);
    if (typeof t.unref === "function") t.unref();
  });

  try {
    const { html } = await Promise.race([compilePromise, timeoutPromise]);

    if (!html) {
      throw new Error("Maizzle compilation produced empty output.");
    }

    return html;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("Maizzle")) throw err;
    const message = err instanceof Error ? err.message : "Unknown Maizzle compilation error";
    throw new Error(`Maizzle compilation failed: ${message}`);
  }
}
