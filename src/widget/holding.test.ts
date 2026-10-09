import { describe, expect, it } from "vitest";
import { afterNoteClose, hoverStep, shouldHold } from "./holding";

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

// QA finding: closing a note opened from the bar left the hover panel open for good.
describe("afterNoteClose", () => {
  it("goes back to the panel only if it was open before the note", () => {
    expect(afterNoteClose({ panelWasOpen: true, pinned: false })).toBe("panel");
    expect(afterNoteClose({ panelWasOpen: true, pinned: true })).toBe("panel");
  });

  it("closes the widget back to the bar or box when the note came from the closed state", () => {
    expect(afterNoteClose({ panelWasOpen: false, pinned: false })).toBe("bar");
  });

  it("keeps a pinned panel pinned", () => {
    expect(afterNoteClose({ panelWasOpen: false, pinned: true })).toBe("panel");
  });
});

// QA finding: after the note moved to a window the page never got the mouseleave, so the hook kept
// "inside" = true and every hold change (the task list mounting) reopened the panel, in a loop.
describe("hoverStep", () => {
  it("opens when the cursor is inside and closes when it is out and nothing holds", () => {
    expect(hoverStep({ inside: true, open: false, holding: false })).toBe("open");
    expect(hoverStep({ inside: false, open: true, holding: false })).toBe("close");
    expect(hoverStep({ inside: false, open: true, holding: true })).toBe("none");
  });

  it("does nothing once the backend said the cursor left and the panel closed", () => {
    expect(hoverStep({ inside: false, open: false, holding: false })).toBe("none");
    expect(hoverStep({ inside: false, open: false, holding: true })).toBe("none");
  });
});
