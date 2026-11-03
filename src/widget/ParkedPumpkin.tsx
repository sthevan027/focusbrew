import { useEffect, useState } from "react";
import Pumpkin from "./Pumpkin";
import { PARK_BLINK_EVERY_MS, PARK_BLINK_MS } from "./pumpkinState";

/**
 * The pumpkin peeking out behind the parked bar: eyes only. Asleep (closed) until
 * the mouse is in the bar's zone; then awake, blinking every few seconds. The
 * blinks make no sound (nobody asked for them). Reduced motion: no blinking.
 */
export default function ParkedPumpkin({ awake }: { awake: boolean }) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (!awake || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBlinking(false);
      return;
    }
    let off: number | undefined;
    const every = window.setInterval(() => {
      setBlinking(true);
      off = window.setTimeout(() => setBlinking(false), PARK_BLINK_MS);
    }, PARK_BLINK_EVERY_MS);
    return () => {
      window.clearInterval(every);
      window.clearTimeout(off);
      setBlinking(false);
    };
  }, [awake]);

  const face = !awake || blinking ? "closed" : "smile";
  return (
    <div className="parked-pumpkin" data-awake={awake ? "true" : undefined} aria-hidden="true">
      <Pumpkin face={face} />
    </div>
  );
}
