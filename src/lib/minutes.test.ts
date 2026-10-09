import { describe, expect, it } from "vitest";
import { clampMinutes, MAX_MINUTES, MIN_MINUTES, parseMinutes } from "./minutes";

describe("parseMinutes", () => {
  it("reads whole minutes and keeps them inside 5..=180", () => {
    expect(parseMinutes("25")).toBe(25);
    expect(parseMinutes("  40 ")).toBe(40);
    expect(parseMinutes("2")).toBe(5);
    expect(parseMinutes("999")).toBe(180);
  });

  it("is null for anything that is not a plain whole number, so the edit is cancelled", () => {
    for (const bad of ["", "   ", "abc", "12abc", "1.5", "1,5", "-10", "+10", "1e2", "٣"]) {
      expect(parseMinutes(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

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
