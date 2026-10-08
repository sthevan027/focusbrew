import { describe, expect, it } from "vitest";
import type { TimerView } from "./types";
import { formatClock, progressFraction, remainingSecs, uLength, uPath } from "./progress";

const NOW = 1_000_000;

const running = (planned: number, deadlineMs: number): TimerView => ({
  status: "running",
  task_id: "a",
  planned_secs: planned,
  remaining_secs: 0,
  deadline_ms: deadlineMs,
});

const paused = (planned: number, remaining: number): TimerView => ({
  status: "paused",
  task_id: "a",
  planned_secs: planned,
  remaining_secs: remaining,
  deadline_ms: 0,
});

const idle: TimerView = { status: "idle", task_id: null, planned_secs: 0, remaining_secs: 0, deadline_ms: 0 };

describe("progressFraction", () => {
  it("is 0 when idle", () => {
    expect(progressFraction(idle, NOW)).toBe(0);
  });

  it("is 0 at the start, 0.5 in the middle and 1 at the deadline", () => {
    expect(progressFraction(running(1500, NOW + 1_500_000), NOW)).toBe(0);
    expect(progressFraction(running(1500, NOW + 750_000), NOW)).toBe(0.5);
    expect(progressFraction(running(1500, NOW), NOW)).toBe(1);
  });

  it("stays between 0 and 1 even if the clock jumps", () => {
    expect(progressFraction(running(1500, NOW + 9_000_000), NOW)).toBe(0); // clock went back
    expect(progressFraction(running(1500, NOW - 5_000), NOW)).toBe(1); // already past
  });

  it("uses the frozen remaining time while paused", () => {
    expect(progressFraction(paused(100, 25), NOW)).toBe(0.75);
    expect(progressFraction(paused(100, 25), NOW + 99_999_999)).toBe(0.75);
  });

  it("never divides by zero", () => {
    expect(progressFraction(paused(0, 0), NOW)).toBe(0);
  });
});

describe("remainingSecs", () => {
  it("rounds up while running, like the backend", () => {
    const t = running(300, NOW + 299_001);
    expect(remainingSecs(t, NOW)).toBe(300);
    expect(remainingSecs(t, NOW + 1_001)).toBe(298);
  });

  it("is never more than planned or below zero", () => {
    expect(remainingSecs(running(300, NOW + 9_000_000), NOW)).toBe(300);
    expect(remainingSecs(running(300, NOW - 1), NOW)).toBe(0);
  });

  it("returns the frozen value when paused and 0 when idle", () => {
    expect(remainingSecs(paused(300, 77), NOW)).toBe(77);
    expect(remainingSecs(idle, NOW)).toBe(0);
  });
});

describe("formatClock", () => {
  it("writes mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(1673)).toBe("27:53");
    expect(formatClock(59.9)).toBe("00:59");
  });

  it("keeps counting minutes past 99 and clamps negatives", () => {
    expect(formatClock(10800)).toBe("180:00");
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("the U-shaped progress line", () => {
  const shape = { width: 320, height: 44, radius: 14, inset: 1 };

  it("goes down the left side, along the bottom and up the right side", () => {
    expect(uPath(shape)).toBe(
      "M 1 0 L 1 29 A 14 14 0 0 0 15 43 L 305 43 A 14 14 0 0 0 319 29 L 319 0",
    );
  });

  it("measures two sides, the bottom and two quarter circles", () => {
    expect(uLength(shape)).toBeCloseTo(2 * 29 + 290 + Math.PI * 14, 5);
  });

  it("shrinks the radius for a box that is too small instead of breaking", () => {
    const tiny = { width: 20, height: 10, radius: 14, inset: 1 };
    expect(uPath(tiny)).not.toContain("NaN");
    const length = uLength(tiny);
    expect(Number.isFinite(length)).toBe(true);
    expect(length).toBeGreaterThanOrEqual(0);
  });

  it("opens to the left on the left edge: along the top, down the right side, back along the bottom", () => {
    expect(uPath(shape, "left")).toBe(
      "M 0 1 L 305 1 A 14 14 0 0 1 319 15 L 319 29 A 14 14 0 0 1 305 43 L 0 43",
    );
  });

  it("opens to the right on the right edge: along the top, down the left side, back along the bottom", () => {
    expect(uPath(shape, "right")).toBe(
      "M 320 1 L 15 1 A 14 14 0 0 0 1 15 L 1 29 A 14 14 0 0 0 15 43 L 320 43",
    );
  });

  it("measures the side edges: two long arms, the short base and two quarter circles", () => {
    expect(uLength(shape, "left")).toBeCloseTo(2 * 305 + 14 + Math.PI * 14, 5);
    expect(uLength(shape, "right")).toBeCloseTo(2 * 305 + 14 + Math.PI * 14, 5);
  });

  it("keeps the top edge exactly as before when no edge is given", () => {
    expect(uPath(shape)).toBe(uPath(shape, "top"));
    expect(uLength(shape)).toBe(uLength(shape, "top"));
  });

  // Review focus: a tiny box on any edge must never produce NaN.
  it("never breaks on a tiny box, whatever the edge", () => {
    const tiny = { width: 20, height: 10, radius: 14, inset: 1 };
    for (const edge of ["top", "left", "right"] as const) {
      expect(uPath(tiny, edge)).not.toContain("NaN");
      const length = uLength(tiny, edge);
      expect(Number.isFinite(length)).toBe(true);
      expect(length).toBeGreaterThanOrEqual(0);
    }
  });
});
