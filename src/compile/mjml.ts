/** Maximum MJML source size: 512KB */
const MAX_SOURCE_SIZE = 512_000;

/**
 * Compile an MJML source string into an HTML email string.
 * Requires: mjml (optional peer dependency)
 */
export async function compileMjml(source: string): Promise<string> {
  // ── Validate ──────────────────────────────────────────────────────
  if (!source || !source.trim()) {
    throw new Error("MJML source must not be empty.");
  }

  if (source.length > MAX_SOURCE_SIZE) {
    throw new Error(`MJML source exceeds ${MAX_SOURCE_SIZE / 1000}KB limit.`);
  }

  if (!/<mjml[\s>]/i.test(source)) {
    throw new Error(
      "MJML source must contain a root <mjml> element. " +
        "Example: <mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>"
    );
  }

  // ── Load optional dependency ──────────────────────────────────────
  let mjml2html: (input: string, options?: Record<string, unknown>) => { html: string; errors: Array<{ line: number; message: string; tagName: string; formattedMessage: string }> };
  try {
    const mjmlModule = await import("mjml");
    mjml2html = mjmlModule.default ?? mjmlModule;
  } catch {
    throw new Error(
      'MJML compilation requires "mjml". Install it:\n  npm install mjml'
    );
  }

  // ── Compile ───────────────────────────────────────────────────────
  try {
    const result = mjml2html(source, {
      validationLevel: "soft",
      keepComments: false,
    });

    if (result.errors && result.errors.length > 0 && !result.html) {
      const errorMessages = result.errors
        .map((e) => `Line ${e.line}: ${e.message} (${e.tagName})`)
        .join("; ");
      throw new Error(`MJML compilation errors: ${errorMessages}`);
    }

    if (!result.html) {
      throw new Error("MJML compilation produced empty output.");
    }

    return result.html;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("MJML")) throw err;
    const message = err instanceof Error ? err.message : "Unknown MJML compilation error";
    throw new Error(`MJML compilation failed: ${message}`);
  }
}
