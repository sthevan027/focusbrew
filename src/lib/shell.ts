import type { TimerStatus, WidgetEdge } from "./types";

/** "closing": the shape is already shrinking but the window is still big. */
export type PanelPhase = "closed" | "open" | "closing";

export interface Size {
  width: number;
  height: number;
}

/**
 * The visible shape, in Medium px. The window sizes in widget.rs must fit
 * these: the bar sits in a 14 px tall window that catches the mouse.
 */
export const BAR: Size = { width: 140, height: 6 };
export const BOX: Size = { width: 320, height: 44 };
export const PANEL: Size = { width: 560, height: 300 };

/** The strip over the bar that reacts to the mouse. */
export const BAR_ZONE: Size = { width: 140, height: 14 };

const NONE: Size = { width: 0, height: 0 };

/** The same rectangle on its side (the parked bar on the left/right edges). */
function turned(size: Size): Size {
  return { width: size.height, height: size.width };
}

export type ShapeKind = "hidden" | "bar" | "box" | "panel";

export interface ShapeContext {
  /** The "widget visible" setting. */
  visible: boolean;
  status: TimerStatus;
  phase: PanelPhase;
  edge: WidgetEdge;
}

export interface Shape {
  kind: ShapeKind;
  /** The visible shape. */
  shell: Size;
  /** The area that takes the mouse — the backend lets it through everywhere else. */
  hit: Size;
}

/**
 * What the widget shows right now, decided in one place by priority:
 * hidden > open panel > running/paused box > parked bar. While closing, the
 * shape is already the closed one (it shrinks before the window does).
 */
export function pickShape({ visible, status, phase, edge }: ShapeContext): Shape {
  if (!visible) return { kind: "hidden", shell: NONE, hit: NONE };
  if (phase === "open") return { kind: "panel", shell: PANEL, hit: PANEL };
  if (status !== "idle") return { kind: "box", shell: BOX, hit: BOX };
  if (edge === "top") return { kind: "bar", shell: BAR, hit: BAR_ZONE };
  return { kind: "bar", shell: turned(BAR), hit: turned(BAR_ZONE) };
}

/** Ms until the countdown (whole seconds left before `deadlineMs`) changes. */
export function nextTickDelay(nowMs: number, deadlineMs: number): number {
  const rest = (((deadlineMs - nowMs) % 1000) + 1000) % 1000;
  return rest === 0 ? 1000 : rest;
}
