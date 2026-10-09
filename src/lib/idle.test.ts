import { describe, expect, it } from "vitest";
import { shouldAutoClose } from "./idle";

describe("shouldAutoClose", () => {
  const t0 = 1_000_000;

  it("never closes when the setting is off", () => {
    expect(shouldAutoClose(t0, t0 + 3_600_000, 0)).toBe(false);
  });

  it("closes once the panel has been idle for the whole time", () => {
    expect(shouldAutoClose(t0, t0 + 29_999, 30)).toBe(false);
    expect(shouldAutoClose(t0, t0 + 30_000, 30)).toBe(true);
    expect(shouldAutoClose(t0, t0 + 90_000, 30)).toBe(true);
  });

  it("does not close if the clock went back", () => {
    expect(shouldAutoClose(t0, t0 - 5_000, 15)).toBe(false);
  });
});
