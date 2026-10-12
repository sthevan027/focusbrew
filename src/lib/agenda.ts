import type { Task } from "./types";

export function isImported(eventId: string, tasks: Task[]): boolean {
  return tasks.some((t) => t.google_event_id === eventId);
}
