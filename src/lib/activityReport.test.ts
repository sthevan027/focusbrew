import { describe, expect, it } from "vitest";
import { formatDuration, parseLocalDate, periodRange } from "./activityReport";

// Oct 17 2026 is a Saturday; its Monday is Oct 12.
const sat = new Date(2026, 9, 17, 15, 30);

describe("periodRange", () => {
  it("today runs from local midnight to the next local midnight", () => {
    const { from, to } = periodRange("today", sat);
    expect(from).toEqual(new Date(2026, 9, 17));
    expect(to).toEqual(new Date(2026, 9, 18));
  });

  it("this week starts on the Monday of the current week", () => {
    const { from, to } = periodRange("week", sat);
    expect(from).toEqual(new Date(2026, 9, 12));
    expect(to).toEqual(new Date(2026, 9, 19));
  });

  it("this week on a Sunday still starts the previous Monday", () => {
    const sun = new Date(2026, 9, 18, 9, 0);
    expect(periodRange("week", sun).from).toEqual(new Date(2026, 9, 12));
  });

  it("this month runs from the 1st to the 1st of next month", () => {
    const { from, to } = periodRange("month", sat);
    expect(from).toEqual(new Date(2026, 9, 1));
    expect(to).toEqual(new Date(2026, 10, 1));
  });

  it("custom treats the end date as inclusive", () => {
    const { from, to } = periodRange("custom", sat, { from: "2026-10-01", to: "2026-10-03" });
    expect(from).toEqual(new Date(2026, 9, 1));
    expect(to).toEqual(new Date(2026, 9, 4));
  });
});

describe("parseLocalDate", () => {
  it("reads YYYY-MM-DD as local midnight, not UTC", () => {
    expect(parseLocalDate("2026-10-17")).toEqual(new Date(2026, 9, 17));
  });
});

describe("formatDuration", () => {
  it("shows minutes under an hour", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(42 * 60)).toBe("42m");
  });

  it("shows hours and minutes", () => {
    expect(formatDuration(6 * 3600 + 42 * 60)).toBe("6h 42m");
  });
});
