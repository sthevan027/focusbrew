export const MIN_MINUTES = 5;
export const MAX_MINUTES = 180;

/** Mirrors `clamp_minutes` in src-tauri/src/tracker/tasks.rs. */
export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)));
}
