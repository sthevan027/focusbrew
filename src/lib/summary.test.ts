import { describe, expect, it } from "vitest";
import type { Session, Task } from "./types";
import { daySummary } from "./summary";

const session = (task_id: string, day: string, secs: number, extra: Partial<Session> = {}): Session => ({
  task_id,
  title: task_id.toUpperCase(),
  project: null,
  day,
  ended_ms: 0,
  secs,
  ...extra,
});

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id.toUpperCase(),
  note: null,
  minutes: 25,
  done: false,
  created_at: "",
  source: "manual",
  spent_secs: 0,
  day: "2026-10-05",
  done_at: null,
  project: null,
  url: null,
  ...extra,
});

const noon = new Date(2026, 9, 5, 12).getTime();

describe("daySummary", () => {
  it("adds up the day per task, most time first", () => {
    const s = daySummary(
      [session("a", "2026-10-05", 600), session("b", "2026-10-05", 1500), session("a", "2026-10-05", 300), session("a", "2026-10-04", 999)],
      [],
      "2026-10-05",
    );
    expect(s.totalSecs).toBe(2400);
    expect(s.rows.map((r) => [r.taskId, r.secs])).toEqual([
      ["b", 1500],
      ["a", 900],
    ]);
  });

  it("marks the tasks checked off that day, and lists them even without time", () => {
    const s = daySummary(
      [session("a", "2026-10-05", 600)],
      [task("a", { done: true, done_at: noon }), task("c", { done: true, done_at: noon }), task("d", { done: true, done_at: noon - 86_400_000 })],
      "2026-10-05",
    );
    expect(s.rows.map((r) => [r.taskId, r.secs, r.done])).toEqual([
      ["a", 600, true],
      ["c", 0, true],
    ]);
    expect(s.doneCount).toBe(2);
  });

  it("keeps the title the block had, even for a removed task", () => {
    const s = daySummary([session("gone", "2026-10-05", 60, { title: "Old name" })], [], "2026-10-05");
    expect(s.rows[0].title).toBe("Old name");
  });

  it("groups by project, the ones without one last", () => {
    const s = daySummary(
      [
        session("a", "2026-10-05", 600, { project: "virex" }),
        session("b", "2026-10-05", 300),
        session("c", "2026-10-05", 900, { project: "focusbrew" }),
        session("d", "2026-10-05", 100, { project: "virex" }),
      ],
      [],
      "2026-10-05",
    );
    expect(s.byProject).toEqual([
      { project: "focusbrew", secs: 900 },
      { project: "virex", secs: 700 },
      { project: null, secs: 300 },
    ]);
  });

  it("is empty for a day with nothing", () => {
    const s = daySummary([], [], "2026-10-05");
    expect(s).toEqual({ totalSecs: 0, doneCount: 0, rows: [], byProject: [] });
  });
});
