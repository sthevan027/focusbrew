import { describe, expect, it } from "vitest";
import { buildGrid, cellTitle, dateKey, formatDuration, level, mondayOf } from "./activity";

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
    expect(dateKey(mondayOf(new Date(2026, 9, 5)))).toBe("2026-10-05"); // Monday
    expect(dateKey(mondayOf(new Date(2026, 9, 7)))).toBe("2026-10-05"); // Wednesday
    expect(dateKey(mondayOf(new Date(2026, 9, 11)))).toBe("2026-10-05"); // Sunday
  });
});

describe("buildGrid", () => {
  it("has 4 weeks of 7 days, Monday first, ending in the current week", () => {
    const grid = buildGrid({}, new Date(2026, 9, 5)); // a Monday
    expect(grid).toHaveLength(28);
    expect(grid[0]?.date).toBe("2026-09-14");
    expect(grid[21]?.date).toBe("2026-10-05");
  });

  it("leaves the days after today empty", () => {
    const grid = buildGrid({}, new Date(2026, 9, 5)); // Monday: the rest of the week is the future
    expect(grid.slice(22)).toEqual([null, null, null, null, null, null]);

    const wednesday = buildGrid({}, new Date(2026, 9, 7));
    expect(wednesday[23]?.date).toBe("2026-10-07");
    expect(wednesday.slice(24)).toEqual([null, null, null, null]);
  });

  it("fills the whole last row on a Sunday", () => {
    const grid = buildGrid({}, new Date(2026, 9, 11));
    expect(grid.slice(21).every((cell) => cell !== null)).toBe(true);
    expect(grid[27]?.date).toBe("2026-10-11");
  });

  it("crosses a month boundary correctly", () => {
    const grid = buildGrid({}, new Date(2026, 2, 1)); // Sunday, 1 March 2026
    expect(grid[0]?.date).toBe("2026-02-02");
    expect(grid[27]?.date).toBe("2026-03-01");
  });

  it("applies the seconds of each day and their tone", () => {
    const grid = buildGrid({ "2026-10-05": 50 * 60, "2026-09-14": 60 }, new Date(2026, 9, 5));
    expect(grid[21]).toEqual({ date: "2026-10-05", secs: 3000, level: 3 });
    expect(grid[0]).toEqual({ date: "2026-09-14", secs: 60, level: 1 });
    expect(grid[1]?.level).toBe(0);
  });
});

describe("durations", () => {
  it("writes minutes, hours and both", () => {
    expect(formatDuration(0)).toBe("0min");
    expect(formatDuration(2700)).toBe("45min");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(5100)).toBe("1h 25min");
  });

  it("builds the tooltip as dd/mm — duration", () => {
    expect(cellTitle({ date: "2026-10-05", secs: 5100, level: 3 })).toBe("05/10 — 1h 25min");
  });
});
