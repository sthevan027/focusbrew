import { describe, expect, it } from "vitest";
import { clampMinutes, MAX_MINUTES, MIN_MINUTES } from "./minutes";

describe("clampMinutes", () => {
  // Must match `clamp_minutes` in src-tauri/src/tracker/tasks.rs.
  it("keeps 5..=180", () => {
    expect([MIN_MINUTES, MAX_MINUTES]).toEqual([5, 180]);
    expect(clampMinutes(0)).toBe(5);
    expect(clampMinutes(25)).toBe(25);
    expect(clampMinutes(999)).toBe(180);
  });

  it("rounds to a whole number of minutes", () => {
    expect(clampMinutes(24.6)).toBe(25);
    expect(clampMinutes(Number.NaN)).toBe(5);
  });
});
