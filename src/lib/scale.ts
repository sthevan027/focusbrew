import type { NotchStyle } from "./types";

/**
 * The size is fixed by the notch style: Standard is the medium size, Minimal
 * the small one. The media-only box is always medium. Must match
 * `AppConfig::scale_factor` (and the media-only case in `hot_zone`) in
 * src-tauri/src/config.rs and widget.rs.
 */
export function scaleFactor(style: NotchStyle, mediaOnly = false): number {
  if (mediaOnly) return 1;
  return style === "minimal" ? 0.85 : 1;
}
