import { useRef } from "react";
import type { TimerView } from "../lib/types";
import { progressFraction, uLength, uPath } from "../lib/progress";
import { useElementSize } from "./hooks";

interface Props {
  timer: TimerView;
  now: number;
  /** Rainbow instead of the accent color. */
  rgb: boolean;
  /** False hides it (the "Progress timeline" switch, or no block running). */
  visible: boolean;
}

const STROKE = 2;
const RADIUS = 14;
const RAINBOW = ["#ff2d55", "#ff9f0a", "#ffd60a", "#30d158", "#0a84ff", "#bf5af2", "#ff2d55"];

/**
 * A thin line that follows the box's left, bottom and right edges (never the
 * top) and fills as the block runs. Sized by measuring its parent, so it fits
 * the notch box and the open panel alike.
 */
export default function ProgressLine({ timer, now, rgb, visible }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);

  if (!visible) return <div ref={ref} className="progress-line" />;

  const shape = { width, height, radius: RADIUS, inset: STROKE / 2 };
  const ready = width > 0 && height > 0;
  const length = ready ? uLength(shape) : 0;
  const path = ready ? uPath(shape) : "";
  const fraction = progressFraction(timer, now);

  return (
    <div ref={ref} className="progress-line">
      {ready && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {rgb && (
            <defs>
              <linearGradient id="rgb-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
                {RAINBOW.map((color, i) => (
                  <stop key={i} offset={i / (RAINBOW.length - 1)} stopColor={color} />
                ))}
              </linearGradient>
            </defs>
          )}
          <path d={path} className="progress-track" strokeWidth={STROKE} fill="none" />
          <path
            d={path}
            className={rgb ? "progress-fill rgb" : "progress-fill"}
            stroke={rgb ? "url(#rgb-line)" : undefined}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - fraction)}
          />
        </svg>
      )}
    </div>
  );
}
