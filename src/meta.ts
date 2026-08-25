import { EMAIL_CLIENTS } from "@emailens/engine";
import pkg from "../package.json" with { type: "json" };

/**
 * CLI identity. Both fields used to be hardcoded in index.ts and both had
 * drifted: `--version` reported 0.4.0 while the package was 0.3.4, and the
 * description claimed 12 clients while the engine shipped 15. Anyone filing a
 * bug would have quoted a version that never existed.
 *
 * Kept in its own module so it can be asserted directly. Testing it through the
 * binary means racing citty's process.exit() against the stdout flush.
 */
export const meta = {
  name: "emailens",
  version: pkg.version,
  description: `Email compatibility analysis CLI; preview how HTML emails render across ${EMAIL_CLIENTS.length} email clients.`,
} as const;
