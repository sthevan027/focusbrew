/** Whether the widget must stay open: a pin, typing/dragging in the list, or an open note. */
export function shouldHold(h: { pinned: boolean; childHold: boolean; noteOpen: boolean }): boolean {
  return h.pinned || h.childHold || h.noteOpen;
}

/** What the widget shows once a note closes: the panel if it was open under the note (or pinned), else back to the bar or box. */
export function afterNoteClose(s: { panelWasOpen: boolean; pinned: boolean }): "panel" | "bar" {
  return s.panelWasOpen || s.pinned ? "panel" : "bar";
}

/** What the hover logic does next: open (cursor in, panel closed), close (cursor out, panel open, nothing holds) or nothing. */
export function hoverStep(s: { inside: boolean; open: boolean; holding: boolean }): "open" | "close" | "none" {
  if (s.inside && !s.open) return "open";
  if (!s.inside && s.open && !s.holding) return "close";
  return "none";
}
