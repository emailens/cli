import { extname } from "node:path";
import type { InputFormat } from "@emailens/engine";

/**
 * Auto-detect input format from file extension.
 */
export function detectFormat(filePath: string): InputFormat {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".tsx":
    case ".jsx":
      return "jsx";
    case ".mjml":
      return "mjml";
    case ".html":
    case ".htm":
      return "html";
    default:
      // For unknown extensions, check if the content starts with <mjml
      // This is handled at compile time; default to html here
      return "html";
  }
}
