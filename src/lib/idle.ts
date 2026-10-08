/**
 * Whether a pinned panel should close by itself: the setting is on (`secs` > 0)
 * and nothing happened in it for `secs` seconds. A clock that went back never
 * closes it.
 */
export function shouldAutoClose(lastActivityMs: number, nowMs: number, secs: number): boolean {
  if (secs <= 0) return false;
  return nowMs - lastActivityMs >= secs * 1000;
}
