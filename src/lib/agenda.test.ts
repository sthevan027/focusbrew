import { describe, expect, it } from "vitest";
import { isImported, syncedAtLabel } from "./agenda";
import type { Task } from "./types";

const task = (over: Partial<Task> = {}): Task => ({
  id: "1", title: "x", note: null, minutes: 25, done: false, created_at: "",
  source: "manual", spent_secs: 0, day: "2026-10-12", done_at: null,
  project: null, url: null, google_event_id: null, updated_at: 0,
  ...over,
});

describe("isImported", () => {
  it("is true when some task already points at that event", () => {
    const tasks = [task({ google_event_id: "evt-1" })];
    expect(isImported("evt-1", tasks)).toBe(true);
  });

  it("is false when no task points at that event", () => {
    const tasks = [task({ google_event_id: "evt-1" })];
    expect(isImported("evt-2", tasks)).toBe(false);
  });

  it("is false when nothing is imported yet", () => {
    expect(isImported("evt-1", [])).toBe(false);
  });
});

describe("syncedAtLabel", () => {
  it("is null before the first sync", () => {
    expect(syncedAtLabel(0)).toBe(null);
  });

  it("is the local HH:MM of the last sync", () => {
    const at = new Date(2026, 9, 12, 14, 5).getTime();
    expect(syncedAtLabel(at)).toBe("14:05");
  });
});
