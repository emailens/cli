import { readFileSync } from "node:fs";
import { EMAIL_CLIENTS, type Framework, type InputFormat } from "@emailens/engine";
import { detectFormat } from "@emailens/engine/compile";

const VALID_FORMATS = new Set(["html", "jsx", "mjml", "maizzle"]);

/**
 * Read HTML input from a file path or stdin (`-`).
 * Always returns a Promise for consistent caller ergonomics.
 */
export async function readInput(pathOrStdin: string): Promise<string> {
  if (pathOrStdin === "-") {
    // Try /dev/stdin first (works on Unix and Git Bash on Windows)
    try {
      return readFileSync("/dev/stdin", "utf-8");
    } catch {
      // Fall through to async approach
    }

    // Async stdin reading for Windows compatibility
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      process.stdin.resume();
      process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      process.stdin.on("end", () => {
        const data = Buffer.concat(chunks).toString("utf-8");
        if (!data.trim()) {
          reject(new Error("No input received from stdin. Pipe HTML or provide a file path."));
        } else {
          resolve(data);
        }
      });
      process.stdin.on("error", () => {
        reject(new Error("No input received from stdin. Pipe HTML or provide a file path."));
      });
    });
  }

  try {
    return readFileSync(pathOrStdin, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read file "${pathOrStdin}": ${message}`);
  }
}

/**
 * Validate and resolve client IDs. Returns all clients if none specified.
 */
export function resolveClients(ids?: string): string[] {
  const validIds = new Set(EMAIL_CLIENTS.map((c) => c.id));

  if (!ids) {
    return EMAIL_CLIENTS.map((c) => c.id);
  }

  const requested = ids.split(",").map((s) => s.trim()).filter(Boolean);
  const invalid = requested.filter((id) => !validIds.has(id));

  if (invalid.length > 0) {
    throw new Error(
      `Unknown client ID(s): ${invalid.join(", ")}.\n` +
      `Valid IDs: ${Array.from(validIds).join(", ")}`
    );
  }

  return requested;
}

/**
 * Resolve the input format from explicit flag, file extension, or default.
 * Validates the --format flag and errors on unknown values.
 * Auto-detects from file extension when no flag is given.
 */
export function resolveFormat(formatFlag?: string, filePath?: string): InputFormat {
  if (formatFlag) {
    if (!VALID_FORMATS.has(formatFlag)) {
      throw new Error(
        `Unknown format "${formatFlag}". Valid formats: ${Array.from(VALID_FORMATS).join(", ")}`
      );
    }
    return formatFlag as InputFormat;
  }

  // Auto-detect from file extension
  if (filePath && filePath !== "-") {
    return detectFormat(filePath);
  }

  return "html";
}

/**
 * Convert a format string to the engine's Framework type.
 */
export function toFramework(format: InputFormat): Framework | undefined {
  if (format === "jsx" || format === "mjml" || format === "maizzle") return format;
  return undefined;
}
