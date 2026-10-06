import { describe, expect, it } from "vitest";
import { buildGrid, dateKey, formatDuration, level, mondayOf, streak, weekTotal } from "./activity";

describe("level", () => {
  it("maps seconds to the five tones", () => {
    expect(level(0)).toBe(0);
    expect(level(-10)).toBe(0);
    expect(level(1)).toBe(1);
    expect(level(14 * 60 + 59)).toBe(1);
    expect(level(15 * 60)).toBe(2);
    expect(level(44 * 60 + 59)).toBe(2);
    expect(level(45 * 60)).toBe(3);
    expect(level(89 * 60 + 59)).toBe(3);
    expect(level(90 * 60)).toBe(4);
    expect(level(10 * 3600)).toBe(4);
  });
});

describe("dates", () => {
  it("writes the local date as AAAA-MM-DD", () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("finds the Monday of any weekday, including Sunday", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(mondayOf("2026-10-07")).toBe("2026-10-05"); // Wednesday
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday
  });
});

describe("buildGrid", () => {
  it("has 5 weeks, Monday first: 3 past ones, the current and the next", () => {
    const grid = buildGrid({}, "2026-10-07", {}); // a Wednesday
    expect(grid).toHaveLength(35);
    expect(grid[0].date).toBe("2026-09-14");
    expect(grid[21].date).toBe("2026-10-05");
    expect(grid[34].date).toBe("2026-10-18");
  });

  it("tells past, today and future apart", () => {
    const grid = buildGrid({}, "2026-10-07", {});
    expect(grid[22].when).toBe("past");
    expect(grid[23].when).toBe("today");
    expect(grid[24].when).toBe("future");
    expect(grid[34].when).toBe("future");
  });

  it("crosses a month boundary correctly", () => {
    const grid = buildGrid({}, "2026-03-01", {}); // Sunday, 1 March 2026
    expect(grid[0].date).toBe("2026-02-02");
    expect(grid[27].date).toBe("2026-03-01");
    expect(grid[28].date).toBe("2026-03-02");
  });

  it("applies the seconds and tone of the past, and planned tasks of the future", () => {
    const grid = buildGrid(
      { "2026-10-05": 50 * 60, "2026-09-14": 60 },
      "2026-10-05",
      { "2026-10-09": 2 },
    );
    expect(grid[21]).toMatchObject({ date: "2026-10-05", secs: 3000, level: 3, when: "today" });
    expect(grid[0]).toMatchObject({ secs: 60, level: 1 });
    expect(grid[25]).toMatchObject({ date: "2026-10-09", planned: 2, level: 0 });
    expect(grid[26].planned).toBe(0);
  });
});

describe("streak", () => {
  it("counts days in a row with focus, ending today", () => {
    const secs = { "2026-10-05": 60, "2026-10-04": 60, "2026-10-03": 60, "2026-10-01": 60 };
    expect(streak(secs, "2026-10-05")).toBe(3);
  });

  it("still counts from yesterday while today has nothing yet", () => {
    expect(streak({ "2026-10-04": 60, "2026-10-03": 60 }, "2026-10-05")).toBe(2);
  });

  it("is zero when neither today nor yesterday had focus", () => {
    expect(streak({ "2026-10-03": 60 }, "2026-10-05")).toBe(0);
  });
});

describe("weekTotal", () => {
  it("adds Monday up to today", () => {
    const secs = { "2026-10-04": 999, "2026-10-05": 600, "2026-10-07": 1200, "2026-10-08": 50 };
    expect(weekTotal(secs, "2026-10-07")).toBe(1800);
  });
});

describe("durations", () => {
  it("writes minutes, hours and both", () => {
    expect(formatDuration(0)).toBe("0min");
    expect(formatDuration(2700)).toBe("45min");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(5100)).toBe("1h 25min");
  });

  it("says less than a minute instead of zero for a few seconds", () => {
    expect(formatDuration(3)).toBe("<1min");
    expect(formatDuration(29)).toBe("<1min");
    expect(formatDuration(30)).toBe("1min");
  });
});
