export const MIN_MINUTES = 5;
export const MAX_MINUTES = 180;

/** Mirrors `clamp_minutes` in src-tauri/src/tracker/tasks.rs. */
export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)));
}

/**
 * The minutes typed into a task's time field: a plain whole number, clamped to
 * 5..=180. `null` for anything else (the edit is cancelled).
 */
export function parseMinutes(text: string): number | null {
  const match = /^\s*(\d{1,4})\s*$/.exec(text);
  return match ? clampMinutes(Number(match[1])) : null;
}
