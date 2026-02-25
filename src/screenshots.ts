import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** CDP connection timeout: 15 seconds */
const CONNECT_TIMEOUT_MS = 15_000;

/** Per-page screenshot timeout: 30 seconds */
const PAGE_TIMEOUT_MS = 30_000;

/**
 * Capture screenshots of email transforms using Browserless via CDP.
 * Requires: playwright-core (optional) + BROWSERLESS_URL env var.
 *
 * Returns map of clientId → screenshot file path.
 */
export async function captureScreenshots(
  transforms: Array<{ clientId: string; html: string }>,
  outputDir: string,
  onProgress?: (clientId: string, index: number, total: number) => void,
): Promise<Map<string, string>> {
  const browserlessUrl = process.env.BROWSERLESS_URL;
  if (!browserlessUrl) {
    throw new Error(
      "Screenshots require the BROWSERLESS_URL environment variable.\n" +
      "Set it to your Browserless instance URL (e.g. ws://localhost:3000)."
    );
  }

  let chromium: typeof import("playwright-core").chromium;
  try {
    const pw = await import("playwright-core");
    chromium = pw.chromium;
  } catch {
    throw new Error(
      'Screenshots require "playwright-core". Install it:\n  npm install playwright-core'
    );
  }

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  const results = new Map<string, string>();
  let browser;

  try {
    // Connect with timeout to avoid hanging on unreachable Browserless
    browser = await Promise.race([
      chromium.connectOverCDP(browserlessUrl),
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => {
          reject(new Error(`Browserless connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s. Check BROWSERLESS_URL.`));
        }, CONNECT_TIMEOUT_MS);
        if (typeof t.unref === "function") t.unref();
      }),
    ]);

    const context = browser.contexts()[0] ?? await browser.newContext();

    for (let i = 0; i < transforms.length; i++) {
      const { clientId, html } = transforms[i];
      onProgress?.(clientId, i + 1, transforms.length);

      const page = await context.newPage();
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);
      await page.setViewportSize({ width: 600, height: 800 });
      await page.setContent(html, { waitUntil: "networkidle" });

      const screenshotPath = join(outputDir, `${clientId}.png`);
      const buffer = await page.screenshot({ fullPage: true });
      writeFileSync(screenshotPath, buffer);
      results.set(clientId, screenshotPath);

      await page.close();
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return results;
}
