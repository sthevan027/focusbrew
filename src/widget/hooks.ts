import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * Current time in ms, refreshed every 250 ms while `active`. The progress
 * line moves well under 1 px per second and the countdown changes once a
 * second, so 4 updates a second is smooth and costs almost no CPU.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
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
  };
}
