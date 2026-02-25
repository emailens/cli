import type { InputFormat } from "@emailens/engine";

/**
 * Compile source to HTML based on format.
 * Returns HTML passthrough if format is "html".
 * Lazily imports framework compilers to avoid loading unnecessary deps.
 */
export async function compile(source: string, format: InputFormat, _filePath?: string): Promise<string> {
  switch (format) {
    case "html":
      return source;

    case "jsx": {
      const { compileReactEmail } = await import("./react-email.js");
      return compileReactEmail(source);
    }

    case "mjml": {
      const { compileMjml } = await import("./mjml.js");
      return compileMjml(source);
    }

    case "maizzle": {
      const { compileMaizzle } = await import("./maizzle.js");
      return compileMaizzle(source);
    }

    default:
      throw new Error(`Unknown format: "${format}". Use html, jsx, mjml, or maizzle.`);
  }
}
