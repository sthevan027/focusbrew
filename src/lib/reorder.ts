/** A copy of `items` with the element at `from` moved to index `to` (clamped). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  if (from === to || from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/**
 * Where a dragged row lands: the number of the *other* rows whose middle is
 * above the pointer. `midpoints` are the rows' vertical middles in order,
 * `from` is the dragged row's index (excluded from the count).
 */
export function dropIndex(midpoints: number[], y: number, from: number): number {
  return midpoints.reduce((count, mid, i) => (i !== from && mid < y ? count + 1 : count), 0);
}

/**
 * How far (px) row `index` slides while row `from` is dragged to slot `over`:
 * the rows it jumps over make room — up when it goes down, down when it goes
 * up. `step` is the dragged row's height plus the gap. The dragged row itself
 * follows the pointer instead, so it never shifts here.
 */
export function rowShift(index: number, from: number, over: number, step: number): number {
  if (index === from) return 0;
  if (over > from && index > from && index <= over) return -step;
  if (over < from && index >= over && index < from) return step;
  return 0;
}

/**
 * How far (px) the dragged row `from` travels to settle in slot `over`: the
 * room (height plus `gap`) of the rows it jumps over; down is positive.
 */
export function jumpDistance(heights: number[], from: number, over: number, gap: number): number {
  let total = 0;
  if (over > from) {
    for (let i = from + 1; i <= over; i++) total += heights[i] + gap;
  } else {
    for (let i = over; i < from; i++) total -= heights[i] + gap;
  }
  return total;
}

/** The pointer's travel limited to what keeps the dragged row inside the list. */
export function clampDelta(delta: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, delta));
}
