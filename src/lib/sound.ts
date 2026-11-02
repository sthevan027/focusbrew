/**
 * The sounds of a theme's character: synthesized with Web Audio, so a theme ships
 * no audio files. Quiet on purpose. Playing is the caller's decision (a theme that
 * has sounds, and the "Sons do tema" switch on); this module only makes the sound.
 */

export type SoundEvent = "blink" | "open" | "cycle_end";

/** The part of AudioContext this module uses (so tests can stand in for it). */
export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<unknown>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

interface OscillatorLike {
  type: string;
  frequency: {
    setValueAtTime(value: number, time: number): unknown;
    linearRampToValueAtTime(value: number, time: number): unknown;
  };
  connect(node: unknown): unknown;
  start(time: number): unknown;
  stop(time: number): unknown;
}

interface GainLike {
  gain: {
    setValueAtTime(value: number, time: number): unknown;
    linearRampToValueAtTime(value: number, time: number): unknown;
  };
  connect(node: unknown): unknown;
}

/** The loudest a sound gets. Low on purpose: it is a cue, not a notification. */
export const PEAK_GAIN = 0.08;

/** One tone: a pitch sweep with a short attack and release. */
function tone(
  ctx: AudioContextLike,
  at: number,
  from: number,
  to: number,
  duration: number,
  type: string,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.linearRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + 0.008);
  gain.gain.linearRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** The notes that play for each event, relative to "now", in seconds. */
function play(ctx: AudioContextLike, event: SoundEvent): void {
  const t = ctx.currentTime;
  switch (event) {
    case "blink":
      // A short "toc": a falling tick.
      tone(ctx, t, 220, 150, 0.07, "triangle");
      return;
    case "open":
      // The mouth opening: a rising, soft sweep.
      tone(ctx, t, 300, 520, 0.18, "sine");
      return;
    case "cycle_end":
      // The end of a block: three rising notes.
      tone(ctx, t, 523, 523, 0.12, "sine");
      tone(ctx, t + 0.12, 659, 659, 0.12, "sine");
      tone(ctx, t + 0.24, 784, 784, 0.2, "sine");
      return;
  }
}

export interface SoundPlayer {
  /**
   * Call from a click or key handler. Creates the audio context on first use and
   * resumes it, since browsers and webviews only let audio start from a gesture.
   */
  unlock(): void;
  /** Plays one event if `enabled`. Never throws: no audio device just means silence. */
  play(event: SoundEvent, enabled: boolean): void;
}

/**
 * One AudioContext for the window, made lazily. `create` is injected so tests can
 * pass a stand-in; in the app it is `() => new AudioContext()`.
 */
export function createSoundPlayer(create: () => AudioContextLike): SoundPlayer {
  let ctx: AudioContextLike | null = null;
  let unavailable = false;

  const context = (): AudioContextLike | null => {
    if (ctx) return ctx;
    if (unavailable) return null;
    try {
      ctx = create();
      return ctx;
    } catch {
      unavailable = true;
      return null;
    }
  };

  return {
    unlock() {
      const c = context();
      if (!c) return;
      try {
        c.resume().catch(() => undefined);
      } catch {
        // Audio blocked here: the sounds stay silent.
      }
    },
    play(event, enabled) {
      if (!enabled) return;
      const c = context();
      if (!c) return;
      try {
        play(c, event);
      } catch {
        // A failed sound is never worth an error in the widget.
      }
    },
  };
}
