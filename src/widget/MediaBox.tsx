import type { MouseEvent } from "react";
import { fire, mediaNext, mediaPause, mediaPlay, mediaPrevious } from "../lib/tauri";
import type { MediaView } from "../lib/types";
import { MusicNoteIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";

/**
 * The media shape: cover, progress and the transport controls, from whatever
 * app Windows is playing. The controls stop the click so it doesn't pin the
 * panel the way a click on the rest of the box does.
 */
export default function MediaBox({ media }: { media: MediaView }) {
  const playing = media.status === "playing";
  const pct = media.duration_secs > 0 ? (media.position_secs / media.duration_secs) * 100 : 0;
  const control = (action: () => Promise<void>) => (e: MouseEvent) => {
    e.stopPropagation();
    fire(action());
  };

  return (
    <div className="notch-box media">
      <div className="media-cover">
        {media.cover_data_url ? <img src={media.cover_data_url} alt="" /> : <MusicNoteIcon size={16} />}
        <div className="media-progress" style={{ width: `${pct}%` }} />
      </div>
      <span className="media-title">{media.title}</span>
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
    </div>
  );
}
