import { describe, expect, it } from "vitest";
import { dropIndex, moveItem } from "./reorder";

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
