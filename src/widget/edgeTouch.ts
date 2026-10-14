import type { WidgetEdge } from "../lib/types";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Whether the cursor is pressed against the screen edge the widget is stuck
 * to: its top row on the top edge, its outer column on the left/right ones.
 * The media box opens the panel this way instead of on a plain hover.
 */
export function touchesEdge(edge: WidgetEdge, box: Box, x: number, y: number, px = 3): boolean {
  if (edge === "left") return x - box.left <= px;
  if (edge === "right") return box.right - x <= px;
  return y - box.top <= px;
}
