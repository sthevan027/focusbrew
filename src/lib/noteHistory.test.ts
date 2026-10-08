import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "./noteHistory";

describe("noteHistory", () => {
  it("undoes and redoes in order", () => {
    let h = createHistory<number[]>([]);
    h = commit(h, [1]);
    h = commit(h, [1, 2]);
    expect(h.present).toEqual([1, 2]);
    h = undo(h);
    expect(h.present).toEqual([1]);
    h = undo(h);
    expect(h.present).toEqual([]);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toEqual([1]);
    expect(canRedo(h)).toBe(true);
  });

  it("forgets the redo branch after a new change", () => {
    let h = commit(commit(createHistory<number[]>([]), [1]), [1, 2]);
    h = undo(h);
    h = commit(h, [1, 9]);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toEqual([1, 9]);
  });

  it("does nothing at the ends and keeps at most `limit` steps", () => {
    const h = createHistory<number[]>([5]);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
    let long = createHistory<number[]>([]);
    for (let i = 1; i <= 10; i++) long = commit(long, [i], 3);
    expect(long.past).toHaveLength(3);
    expect(long.present).toEqual([10]);
  });

  it("ignores a commit that changes nothing", () => {
    const h = createHistory<number[]>([1]);
    const same = h.present;
    expect(commit(h, same)).toBe(h);
  });
});
