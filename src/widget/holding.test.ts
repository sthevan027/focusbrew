import { describe, expect, it } from "vitest";
import { shouldHold } from "./holding";

// Review fix C2: the task list unmounting under a note released the hold that keeps the widget open.
describe("shouldHold", () => {
  it("holds for a pin, for typing/dragging, or for an open note", () => {
    expect(shouldHold({ pinned: true, childHold: false, noteOpen: false })).toBe(true);
    expect(shouldHold({ pinned: false, childHold: true, noteOpen: false })).toBe(true);
    expect(shouldHold({ pinned: false, childHold: false, noteOpen: true })).toBe(true);
  });

  it("lets go only when none of them is on", () => {
    expect(shouldHold({ pinned: false, childHold: false, noteOpen: false })).toBe(false);
  });

  it("an open note wins over the list letting go (the list unmounts when the note opens)", () => {
    expect(shouldHold({ pinned: false, childHold: false, noteOpen: true })).toBe(true);
  });
});
