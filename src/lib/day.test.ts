import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import { addDays, carriedFrom, dayLabel, dayOfMs, plannedByDay, tabsFor, tasksForDay } from "./day";

const task = (id: string, day: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  note: null,
  minutes: 25,
  done: false,
  created_at: "",
  source: "manual",
  spent_secs: 0,
  day,
  done_at: null,
  project: null,
  url: null,
  ...extra,
});

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("addDays", () => {
  it("walks across months and years", () => {
    expect(addDays("2026-10-05", 1)).toBe("2026-10-06");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("dayLabel", () => {
  it("says today, tomorrow and yesterday in words", () => {
    expect(dayLabel("2026-10-05", "2026-10-05")).toBe("Hoje");
    expect(dayLabel("2026-10-06", "2026-10-05")).toBe("Amanhã");
    expect(dayLabel("2026-10-04", "2026-10-05")).toBe("Ontem");
  });

  it("writes other days as weekday and date", () => {
    expect(dayLabel("2026-10-08", "2026-10-05")).toBe("qui 08/10");
    expect(dayLabel("2026-09-27", "2026-10-05")).toBe("dom 27/09");
  });
});

describe("dayOfMs", () => {
  it("is the local date of a moment", () => {
    expect(dayOfMs(at(2026, 10, 5, 23))).toBe("2026-10-05");
  });
});

describe("tasksForDay", () => {
  const today = "2026-10-05";
  const list = [
    task("old", "2026-10-02"),
    task("today", today),
    task("later", "2026-10-08"),
    task("doneToday", "2026-10-01", { done: true, done_at: at(2026, 10, 5) }),
    task("doneBefore", "2026-10-01", { done: true, done_at: at(2026, 10, 3) }),
    task("doneLater", "2026-10-08", { done: true, done_at: at(2026, 10, 4) }),
  ];
  const ids = (ts: Task[]) => ts.map((t) => t.id);

  it("today: open tasks up to today (carried over too) and what was finished today", () => {
    const view = tasksForDay(list, today, today);
    expect(ids(view.open)).toEqual(["old", "today"]);
    expect(ids(view.done)).toEqual(["doneToday"]);
  });

  it("a future day: only what is planned for it", () => {
    const view = tasksForDay(list, "2026-10-08", today);
    expect(ids(view.open)).toEqual(["later"]);
    expect(ids(view.done)).toEqual(["doneLater"]);
  });

  it("a past day: nothing open, and what was finished that day", () => {
    const view = tasksForDay(list, "2026-10-03", today);
    expect(view.open).toEqual([]);
    expect(ids(view.done)).toEqual(["doneBefore"]);
  });
});

describe("tabsFor", () => {
  const today = "2026-10-05";
  it("past days only have the summary", () => {
    expect(tabsFor("2026-10-04", today, true)).toEqual(["summary"]);
  });
  it("future days have the plan, and GitHub when connected", () => {
    expect(tabsFor("2026-10-06", today, false)).toEqual(["tasks"]);
    expect(tabsFor("2026-10-06", today, true)).toEqual(["tasks", "github"]);
  });
  it("today has everything", () => {
    expect(tabsFor(today, today, true)).toEqual(["tasks", "summary", "github"]);
    expect(tabsFor(today, today, false)).toEqual(["tasks", "summary"]);
  });
});

describe("plannedByDay", () => {
  it("counts open tasks of future days only", () => {
    const list = [task("a", "2026-10-08"), task("b", "2026-10-08"), task("c", "2026-10-05"), task("d", "2026-10-09", { done: true })];
    expect(plannedByDay(list, "2026-10-05")).toEqual({ "2026-10-08": 2 });
  });
});

describe("carriedFrom", () => {
  it("is the planned day of a task left over from before", () => {
    expect(carriedFrom(task("a", "2026-10-02"), "2026-10-05")).toBe("02/10");
    expect(carriedFrom(task("a", "2026-10-05"), "2026-10-05")).toBe(null);
    expect(carriedFrom(task("a", "2026-10-08"), "2026-10-05")).toBe(null);
  });
});
