import { describe, expect, it } from "vitest";
import { touchesEdge } from "./edgeTouch";

// A 320x44 box whose top-left corner is at (100, 0), like the widget on the top edge.
const box = { left: 100, top: 0, right: 420, bottom: 44 };

describe("touchesEdge", () => {
  it("is true when the cursor is on the top row of a widget stuck to the top edge", () => {
    expect(touchesEdge("top", box, 200, 0)).toBe(true);
    expect(touchesEdge("top", box, 200, 2)).toBe(true);
  });

  it("is false in the middle of the box, so hovering it does not open the panel", () => {
    expect(touchesEdge("top", box, 200, 22)).toBe(false);
  });

  it("uses the left edge for a widget on the left and the right edge for one on the right", () => {
    const standing = { left: 0, top: 400, right: 56, bottom: 488 };
    expect(touchesEdge("left", standing, 0, 440)).toBe(true);
    expect(touchesEdge("left", standing, 40, 440)).toBe(false);
    expect(touchesEdge("right", standing, 55, 440)).toBe(true);
    expect(touchesEdge("right", standing, 10, 440)).toBe(false);
  });
});
