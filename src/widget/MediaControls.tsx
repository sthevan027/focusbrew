import type { MouseEvent } from "react";
import { fire, mediaNext, mediaPause, mediaPlay, mediaPrevious } from "../lib/tauri";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";

/**
 * Previous, play/pause and next for whatever app Windows is playing. A click
 * stops there, so it doesn't pin the panel the way a click on the box does.
 */
export default function MediaControls({ playing }: { playing: boolean }) {
  const control = (action: () => Promise<void>) => (e: MouseEvent) => {
    e.stopPropagation();
    fire(action());
  };

  return (
    <div className="media-controls">
      <button type="button" onClick={control(mediaPrevious)} aria-label="Faixa anterior">
        <PreviousIcon size={12} />
      </button>
      <button type="button" onClick={control(playing ? mediaPause : mediaPlay)} aria-label={playing ? "Pausar" : "Tocar"}>
        {playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
      </button>
      <button type="button" onClick={control(mediaNext)} aria-label="Próxima faixa">
        <NextIcon size={12} />
      </button>
    </div>
  );
}
