import type { Task } from "./types";

export function isImported(eventId: string, tasks: Task[]): boolean {
  return tasks.some((t) => t.google_event_id === eventId);
}

/** "HH:MM" in local time for the last sync, or null before the first one. */
export function syncedAtLabel(ms: number): string | null {
  if (ms <= 0) return null;
  return new Date(ms).toTimeString().slice(0, 5);
}
