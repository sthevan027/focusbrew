import { createSoundPlayer } from "../lib/sound";
import type { AudioContextLike } from "../lib/sound";

/** The window's sound player: one AudioContext, made on the first click. */
export const themeSounds = createSoundPlayer(() => {
  if (typeof window.AudioContext !== "function") throw new Error("Web Audio indisponível");
  return new window.AudioContext() as unknown as AudioContextLike;
});
