import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { themeSounds } from "../themes/sounds";
import { useThemeFeatures } from "../themes/ThemeContext";
import Pumpkin from "./Pumpkin";
import { pressSteps, restFace, runSteps } from "./pumpkinState";
import type { PumpkinFace } from "./pumpkinState";

interface Props {
  /** The thing it starts/stops is running now (a block, or the music). */
  running: boolean;
  /** A block is paused (the eyes close). */
  paused: boolean;
  label: string;
  /** Runs at once on click; the animation never delays the action. */
  onPress: () => void;
  className?: string;
  /** The media controls sit inside a box that pins the panel on click: stop that. */
  stopPropagation?: boolean;
}

/**
 * The start/play button of the pumpkin theme. A press runs the click sequence
 * (blink, blink, mouth open) and its sound, if the theme's sounds are on.
 */
export default function PumpkinButton({ running, paused, label, onPress, className, stopPropagation }: Props) {
  const { sounds } = useThemeFeatures();
  const [face, setFace] = useState<PumpkinFace | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  useEffect(() => () => cancel.current?.(), []);

  const press = (e: MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    themeSounds.unlock();
    const starting = !running;
    onPress();
    if (!starting) return; // pausing: the rest face shows the pause at once
    cancel.current?.();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancel.current = runSteps(
      pressSteps(reduced),
      (step) => {
        if (!step) {
          setFace(null);
          return;
        }
        setFace(step.face);
        if (step.sound) themeSounds.play(step.sound, sounds);
      },
      (fn, ms) => {
        const id = window.setTimeout(fn, ms);
        return () => window.clearTimeout(id);
      },
    );
  };

  return (
    <button type="button" className={className ? `${className} pumpkin-button` : "pumpkin-button"} aria-label={label} onClick={press}>
      <Pumpkin face={face ?? restFace({ running, paused })} />
    </button>
  );
}
