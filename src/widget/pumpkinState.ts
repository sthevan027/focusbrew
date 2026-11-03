/**
 * The pumpkin's faces and its click sequence, as data. No DOM and no timers here:
 * the component runs the steps with its own scheduler (see `runSteps`).
 */

/** smile: eyes open, default mouth. open: mouth open. closed: eyes shut (also "paused"). */
export type PumpkinFace = "smile" | "open" | "closed";
export type PumpkinSound = "blink" | "open";

export interface PumpkinStep {
  face: PumpkinFace;
  /** How long this face stays, in ms. */
  ms: number;
  /** A sound to play when this face starts (the sounds follow the theme's switch). */
  sound?: PumpkinSound;
}

export const BLINK_MS = 140;
export const OPEN_HOLD_MS = 1000;
/** Resting, the parked pumpkin blinks this often while the mouse is near it. */
export const PARK_BLINK_EVERY_MS = 5000;
export const PARK_BLINK_MS = 160;

/**
 * The click: two blinks, then the mouth opens. With reduced motion the blinks are
 * skipped and the mouth opens for a moment (the sound still plays: it is audio, not motion).
 */
export function pressSteps(reducedMotion: boolean): PumpkinStep[] {
  if (reducedMotion) return [{ face: "open", ms: OPEN_HOLD_MS, sound: "open" }];
  return [
    { face: "closed", ms: BLINK_MS, sound: "blink" },
    { face: "smile", ms: BLINK_MS },
    { face: "closed", ms: BLINK_MS, sound: "blink" },
    { face: "smile", ms: BLINK_MS },
    { face: "open", ms: OPEN_HOLD_MS, sound: "open" },
  ];
}

/** The face at rest: running keeps the mouth open, a pause closes the eyes. */
export function restFace({ running, paused }: { running: boolean; paused: boolean }): PumpkinFace {
  if (paused) return "closed";
  if (running) return "open";
  return "smile";
}

/**
 * Runs the steps in order: `onStep` gets each step when it starts, and `null` when
 * the sequence is over (back to the rest face). Returns a cancel function.
 */
export function runSteps(
  steps: PumpkinStep[],
  onStep: (step: PumpkinStep | null) => void,
  schedule: (fn: () => void, ms: number) => () => void,
): () => void {
  const cancels: (() => void)[] = [];
  let at = 0;
  steps.forEach((step) => {
    cancels.push(schedule(() => onStep(step), at));
    at += step.ms;
  });
  cancels.push(schedule(() => onStep(null), at));
  return () => cancels.forEach((cancel) => cancel());
}
