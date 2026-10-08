import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { shouldAutoClose } from "../lib/idle";
import { motionBetween, nextTickDelay } from "../lib/shell";
import type { Motion, ShapeKind } from "../lib/shell";

/**
 * Current time in ms while `active`, refreshed right when the countdown to
 * `deadlineMs` changes — so every second lasts a second on screen. The
 * progress line glides between updates with a CSS transition.
 */
export function useNow(active: boolean, deadlineMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    let id = 0;
    // +2 ms so the whole second has surely flipped when we read the clock.
    const schedule = (from: number) => {
      id = window.setTimeout(tick, nextTickDelay(from, deadlineMs) + 2);
    };
    const tick = () => {
      const t = Date.now();
      setNow(t);
      schedule(t);
    };
    schedule(Date.now());
    return () => window.clearTimeout(id);
  }, [active, deadlineMs]);
  return now;
}

/** The element's layout size, kept up to date with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * Opens after the mouse rests on the widget for `openDelay` ms and closes
 * `closeDelay` ms after it leaves — unless something holds it open (the "Add a
 * task" field has focus, or a row is being dragged).
 */
export function useHoverOpen(
  onChange: (open: boolean) => void,
  openDelay = 250,
  closeDelay = 400,
) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const inside = useRef(false);
  const holding = useRef(false);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const apply = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
    onChange(next);
  };

  const schedule = () => {
    clear();
    if (inside.current && !openRef.current) {
      timer.current = window.setTimeout(() => apply(true), openDelay);
    } else if (!inside.current && openRef.current && !holding.current) {
      timer.current = window.setTimeout(() => {
        if (!inside.current && !holding.current) apply(false);
      }, closeDelay);
    }
  };

  useEffect(() => clear, []);

  return {
    open,
    onMouseEnter: () => {
      inside.current = true;
      schedule();
    },
    onMouseLeave: () => {
      inside.current = false;
      schedule();
    },
    setHolding: (value: boolean) => {
      holding.current = value;
      schedule();
    },
    /** Opens right away, no hover delay (a click on the bar). */
    openNow: () => {
      clear();
      if (!openRef.current) apply(true);
    },
    /** Closes right away, whatever holds it (Esc, a click elsewhere). */
    closeNow: () => {
      clear();
      holding.current = false;
      if (openRef.current) apply(false);
    },
  };
}

/**
 * How the shape just changed: "grow" or "shrink" until the next change of
 * kind. The first render is "same" (nothing animates on mount).
 */
export function useMotion(kind: ShapeKind): Motion {
  const last = useRef(kind);
  const motion = useRef<Motion>("same");
  if (last.current !== kind) {
    motion.current = motionBetween(last.current, kind);
    last.current = kind;
  }
  return motion.current;
}

/**
 * Closes a pinned panel that nobody touches: while `active`, any pointer move,
 * click, key or scroll counts as activity. The clock stands still (and starts
 * over once released) while `held()` says something keeps the panel open, like
 * typing in a field or dragging a task.
 */
export function useIdleClose(active: boolean, secs: number, held: () => boolean, onClose: () => void) {
  const heldRef = useRef(held);
  heldRef.current = held;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active || secs <= 0) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    for (const name of events) window.addEventListener(name, bump, { passive: true });
    const id = window.setInterval(() => {
      const now = Date.now();
      if (heldRef.current()) {
        last = now;
        return;
      }
      if (shouldAutoClose(last, now, secs)) closeRef.current();
    }, 1000);
    return () => {
      for (const name of events) window.removeEventListener(name, bump);
      window.clearInterval(id);
    };
  }, [active, secs]);
}
