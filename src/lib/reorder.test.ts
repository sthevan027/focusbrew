import { describe, expect, it } from "vitest";
import { clampDelta, dropIndex, jumpDistance, moveItem, rowShift } from "./reorder";

describe("clampDelta", () => {
  it("keeps the dragged row inside the list: it cannot go past the top or the bottom", () => {
    expect(clampDelta(-80, -30, 120)).toBe(-30);
    expect(clampDelta(200, -30, 120)).toBe(120);
    expect(clampDelta(40, -30, 120)).toBe(40);
  });

  it("does not move at all when the list has no room (min above max)", () => {
    expect(clampDelta(50, 0, 0)).toBe(0);
  });
});

describe("rowShift", () => {
  const step = 40;

  it("moves the rows the dragged one jumps over out of its way: up when it goes down", () => {
    // 4 rows, row 1 is dragged down to slot 3: rows 2 and 3 slide up
    expect(rowShift(0, 1, 3, step)).toBe(0);
    expect(rowShift(2, 1, 3, step)).toBe(-40);
    expect(rowShift(3, 1, 3, step)).toBe(-40);
  });

  it("slides them down when the dragged one goes up", () => {
    // row 3 is dragged up to slot 1: rows 1 and 2 slide down
    expect(rowShift(0, 3, 1, step)).toBe(0);
    expect(rowShift(1, 3, 1, step)).toBe(40);
    expect(rowShift(2, 3, 1, step)).toBe(40);
  });

  it("shifts nothing while the dragged row stays in its slot, and never the dragged row", () => {
    for (let i = 0; i < 4; i++) expect(rowShift(i, 2, 2, step)).toBe(0);
    expect(rowShift(1, 1, 3, step)).toBe(0);
  });
});

describe("jumpDistance", () => {
  const heights = [32, 50, 32, 32];

  it("is the room of the rows it jumps over (height plus gap), down is positive", () => {
    expect(jumpDistance(heights, 0, 2, 6)).toBe(50 + 6 + 32 + 6);
    expect(jumpDistance(heights, 0, 1, 6)).toBe(50 + 6);
  });

  it("is negative going up and zero when it does not move", () => {
    expect(jumpDistance(heights, 3, 1, 6)).toBe(-(50 + 6 + 32 + 6));
    expect(jumpDistance(heights, 2, 2, 6)).toBe(0);
  });
});

describe("moveItem", () => {
  it("moves down and up", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("returns a copy and changes nothing when from equals to or is out of range", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(items, 1, 1)).not.toBe(items);
    expect(moveItem(items, 5, 0)).toEqual(["a", "b"]);
    expect(moveItem(items, -1, 0)).toEqual(["a", "b"]);
  });

  it("clamps the target to the ends", () => {
    expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
  });
});

describe("dropIndex", () => {
  const mids = [10, 30, 50];

  it("counts the other rows whose middle is above the pointer", () => {
    expect(dropIndex(mids, 40, 0)).toBe(1); // row 0 dragged between rows 1 and 2
    expect(dropIndex(mids, 20, 2)).toBe(1); // row 2 dragged between rows 0 and 1
  });

  it("goes to the ends when the pointer is above or below everything", () => {
    expect(dropIndex(mids, 0, 1)).toBe(0);
    expect(dropIndex(mids, 100, 0)).toBe(2);
  });

  it("agrees with moveItem: dragging row 0 down past row 1 gives [b, a, c]", () => {
    const to = dropIndex(mids, 40, 0);
    expect(moveItem(["a", "b", "c"], 0, to)).toEqual(["b", "a", "c"]);
  });
});
