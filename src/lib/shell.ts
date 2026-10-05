import type { TimerStatus } from "./types";

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
export const PANEL: Size = { width: 470, height: 230 };

/** The strip over the bar that reacts to the mouse. */
export const BAR_ZONE: Size = { width: 140, height: 14 };

export function shellSize(status: TimerStatus, phase: PanelPhase): Size {
  if (phase === "open") return PANEL;
  return status === "idle" ? BAR : BOX;
}

/** The area that takes the mouse — the backend lets it through everywhere else. */
export function hitSize(status: TimerStatus, phase: PanelPhase): Size {
  if (phase === "open") return PANEL;
  return status === "idle" ? BAR_ZONE : BOX;
}

/** Ms until the countdown (whole seconds left before `deadlineMs`) changes. */
export function nextTickDelay(nowMs: number, deadlineMs: number): number {
  const rest = (((deadlineMs - nowMs) % 1000) + 1000) % 1000;
  return rest === 0 ? 1000 : rest;
}
