import type { NotchStyle, WidgetEdge } from "./types";

/**
 * What the running box shows inside:
 * - "split": the countdown on one side, the task on the other (Standard, top);
 * - "center": only the countdown, in the middle (Minimal, top);
 * - "side-icon" / "side-plain": the standing bar on the left/right edges, with
 *   or without the little clock (Standard / Minimal).
 */
export type NotchLayout = "split" | "center" | "side-icon" | "side-plain";

export function notchLayout(style: NotchStyle, edge: WidgetEdge): NotchLayout {
  if (edge === "top") return style === "standard" ? "split" : "center";
  return style === "standard" ? "side-icon" : "side-plain";
}
