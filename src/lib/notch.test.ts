import { describe, expect, it } from "vitest";
import { notchLayout } from "./notch";

describe("notchLayout", () => {
  it("splits the box on the top in Standard: the countdown on one side, the task on the other", () => {
    expect(notchLayout("standard", "top")).toBe("split");
  });

  it("shows only the countdown, centered, on the top in Minimal", () => {
    expect(notchLayout("minimal", "top")).toBe("center");
  });

  it("keeps the clock icon in the standing bar in Standard and drops it in Minimal", () => {
    for (const edge of ["left", "right"] as const) {
      expect(notchLayout("standard", edge)).toBe("side-icon");
      expect(notchLayout("minimal", edge)).toBe("side-plain");
    }
  });
});
