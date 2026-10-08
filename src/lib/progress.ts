import type { TimerView, WidgetEdge } from "./types";

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

/**
 * The "U" the progress line follows: it hugs three sides of the box and leaves
 * open the side that touches the screen edge.
 */
export interface UShape {
  width: number;
  height: number;
  radius: number;
  /** Half the stroke width, so the line stays inside the box. */
  inset: number;
}

/** How deep the U is (open end to base) and how wide it spans, per edge. */
function dims(shape: UShape, edge: WidgetEdge): { depth: number; span: number } {
  return edge === "top"
    ? { depth: shape.height, span: shape.width }
    : { depth: shape.width, span: shape.height };
}

/** A radius that fits the box, so a tiny box never produces a broken path. */
function safeRadius(shape: UShape, edge: WidgetEdge): number {
  const { depth, span } = dims(shape, edge);
  return Math.max(0, Math.min(shape.radius, depth - shape.inset, (span - 2 * shape.inset) / 2));
}

/**
 * `top`: down the left, along the bottom, up the right. `left`: along the top,
 * down the right, back along the bottom. `right`: the same, mirrored. The fill
 * always starts at the top tip.
 */
export function uPath(shape: UShape, edge: WidgetEdge = "top"): string {
  const { width, height, inset } = shape;
  const r = safeRadius(shape, edge);
  const x0 = inset;
  const x1 = width - inset;
  const y0 = inset;
  const y1 = height - inset;
  if (edge === "left") {
    return `M 0 ${y0} L ${x1 - r} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y0 + r} L ${x1} ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} L 0 ${y1}`;
  }
  if (edge === "right") {
    return `M ${width} ${y0} L ${x0 + r} ${y0} A ${r} ${r} 0 0 0 ${x0} ${y0 + r} L ${x0} ${y1 - r} A ${r} ${r} 0 0 0 ${x0 + r} ${y1} L ${width} ${y1}`;
  }
  return `M ${x0} 0 L ${x0} ${y1 - r} A ${r} ${r} 0 0 0 ${x0 + r} ${y1} L ${x1 - r} ${y1} A ${r} ${r} 0 0 0 ${x1} ${y1 - r} L ${x1} 0`;
}

export function uLength(shape: UShape, edge: WidgetEdge = "top"): number {
  const { depth, span } = dims(shape, edge);
  const r = safeRadius(shape, edge);
  const side = depth - shape.inset - r;
  const base = span - 2 * shape.inset - 2 * r;
  return 2 * side + base + Math.PI * r;
}
