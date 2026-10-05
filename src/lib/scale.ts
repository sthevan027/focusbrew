import type { WidgetScale } from "./types";

/** Must match `WidgetScale::factor` in src-tauri/src/config.rs. */
export const SCALE_FACTOR: Record<WidgetScale, number> = {
  small: 0.85,
  medium: 1,
  large: 1.25,
};
