import type { TimerView } from "./types";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Fraction of the block already worked (0..1), from the deadline and the
 * wall clock. The front-end never counts time: the backend sends `deadline_ms`
 * (running) or `remaining_secs` (paused) and this does the arithmetic.
 */
export function progressFraction(timer: TimerView, nowMs: number): number {
  if (timer.status === "idle" || timer.planned_secs <= 0) return 0;
  const remainingMs =
    timer.status === "running" ? timer.deadline_ms - nowMs : timer.remaining_secs * 1000;
  return clamp01(1 - remainingMs / (timer.planned_secs * 1000));
}

/** Whole seconds left, rounded up like the backend does. */
export function remainingSecs(timer: TimerView, nowMs: number): number {
  if (timer.status === "idle") return 0;
  if (timer.status === "paused") return timer.remaining_secs;
  const left = Math.max(0, Math.ceil((timer.deadline_ms - nowMs) / 1000));
  return Math.min(left, timer.planned_secs);
}

/** "mm:ss" ("27:53"); minutes keep growing past 99 ("180:00"). */
export function formatClock(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** The "U" the progress line follows: down the left, along the bottom, up the right. */
export interface UShape {
  width: number;
  height: number;
  radius: number;
  /** Half the stroke width, so the line stays inside the box. */
  inset: number;
}

/** A radius that fits the box, so a tiny box never produces a broken path. */
function safeRadius({ width, height, radius, inset }: UShape): number {
  return Math.max(0, Math.min(radius, height - inset, (width - 2 * inset) / 2));
}

export function uPath(shape: UShape): string {
  const { width, height, inset } = shape;
  const r = safeRadius(shape);
  const x0 = inset;
  const x1 = width - inset;
  const yb = height - inset;
  return `M ${x0} 0 L ${x0} ${yb - r} A ${r} ${r} 0 0 0 ${x0 + r} ${yb} L ${x1 - r} ${yb} A ${r} ${r} 0 0 0 ${x1} ${yb - r} L ${x1} 0`;
}

export function uLength(shape: UShape): number {
  const { width, height, inset } = shape;
  const r = safeRadius(shape);
  const side = height - inset - r;
  const bottom = width - 2 * inset - 2 * r;
  return 2 * side + bottom + Math.PI * r;
}
