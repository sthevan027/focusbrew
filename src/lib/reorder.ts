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
