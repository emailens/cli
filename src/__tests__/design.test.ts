import { describe, expect, test } from "bun:test";
import type { DesignResult } from "@emailens/engine/design";
import { designExitCode } from "../commands/design.js";

// The check itself (two pages in a browser) is the engine's and is tested
// there. The CLI owns what a verdict does to the build.

describe("designExitCode", () => {
  const r = (verdict: DesignResult["verdict"]) => ({ verdict }) as DesignResult;
  test("fails on Broken", () => {
    expect(designExitCode([r("kept"), r("broken")])).toBe(1);
  });
  test("passes Needs work unless strict", () => {
    expect(designExitCode([r("changed")])).toBe(0);
    expect(designExitCode([r("changed")], true)).toBe(1);
  });
  test("passes when every client is Ready", () => {
    expect(designExitCode([r("kept")], true)).toBe(0);
  });
});
