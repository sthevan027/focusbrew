/** Whether the widget must stay open: a pin, typing/dragging in the list, or an open note. */
export function shouldHold(h: { pinned: boolean; childHold: boolean; noteOpen: boolean }): boolean {
  return h.pinned || h.childHold || h.noteOpen;
}
