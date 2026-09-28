import type { CSSWarning, SourceLocation, TransformResult } from "@emailens/engine";

/** The headline is the worst client. A mean of 21 clients hides the one that fails. */
export function worstClientScore(
  scores: Record<string, { score: number }>,
): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return Math.min(...values.map((s) => s.score));
}

interface JsonOutput {
  overallScore: number;
  scores: Record<string, { score: number; errors: number; warnings: number; info: number }>;
  warnings: Array<{
    client: string;
    property: string;
    severity: string;
    message: string;
    suggestion?: string;
    fix?: {
      before: string;
      after: string;
      language: string;
      description: string;
    };
    /** First occurrence in the source. HTML input only. */
    loc?: SourceLocation;
    /** Every occurrence, in document order. */
    locs?: SourceLocation[];
    /** `locs` is capped and does not list every occurrence. */
    locsTruncated?: boolean;
  }>;
  transforms?: Array<{
    clientId: string;
    html: string;
  }>;
  darkMode?: Record<string, {
    html: string;
    warningCount: number;
  }>;
}

/**
 * Build the JSON output object. Reusable by both printJson() and export command.
 */
export function formatJsonOutput(opts: {
  scores: Record<string, { score: number; errors: number; warnings: number; info: number }>;
  warnings: CSSWarning[];
  transforms?: TransformResult[];
  darkMode?: Record<string, { html: string; warnings: CSSWarning[] }>;
}): JsonOutput {
  const overallScore = worstClientScore(opts.scores);

  const output: JsonOutput = {
    overallScore,
    scores: opts.scores,
    warnings: opts.warnings.map((w) => ({
      client: w.client,
      property: w.property,
      severity: w.severity,
      message: w.message,
      suggestion: w.suggestion,
      fix: w.fix ? {
        before: w.fix.before,
        after: w.fix.after,
        language: w.fix.language,
        description: w.fix.description,
      } : undefined,
      loc: w.loc,
      locs: w.locs,
      locsTruncated: w.locsTruncated,
    })),
  };

  if (opts.transforms) {
    output.transforms = opts.transforms.map((t) => ({
      clientId: t.clientId,
      html: t.html,
    }));
  }

  if (opts.darkMode) {
    output.darkMode = {};
    for (const [clientId, dm] of Object.entries(opts.darkMode)) {
      output.darkMode[clientId] = {
        html: dm.html,
        warningCount: dm.warnings.length,
      };
    }
  }

  return output;
}

/**
 * Format analysis/preview results as JSON and print to stdout.
 */
export function printJson(opts: {
  scores: Record<string, { score: number; errors: number; warnings: number; info: number }>;
  warnings: CSSWarning[];
  transforms?: TransformResult[];
  darkMode?: Record<string, { html: string; warnings: CSSWarning[] }>;
}): void {
  console.log(JSON.stringify(formatJsonOutput(opts), null, 2));
}
