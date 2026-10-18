import type { MouseEvent } from "react";
import { fire, mediaNext, mediaPause, mediaPlay, mediaPrevious } from "../lib/tauri";
import type { MediaView } from "../lib/types";
import { MusicNoteIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";

/**
 * The panel's Música tab: the bigger version of the media box, with the cover,
 * the artist and the same controls.
 */
export default function MediaTab({ media }: { media: MediaView }) {
  const playing = media.status === "playing";
  const control = (action: () => Promise<void>) => (e: MouseEvent) => {
    e.stopPropagation();
    fire(action());
  };

  return (
    <div className="media-tab">
      <div className="media-tab-cover">
        {media.cover_data_url ? <img src={media.cover_data_url} alt="" /> : <MusicNoteIcon size={40} />}
      </div>

      <div className="media-tab-body">
        <div className="media-tab-info">
          <strong>{media.title}</strong>
          <span>{media.artist}</span>
        </div>

        <div className="media-tab-controls">
          <button className="media-tab-previous" type="button" onClick={control(mediaPrevious)} aria-label="Faixa anterior">
            <PreviousIcon size={20} />
          </button>
          <button type="button" onClick={control(playing ? mediaPause : mediaPlay)} aria-label={playing ? "Pausar" : "Tocar"}>
            {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          </button>
          <button type="button" onClick={control(mediaNext)} aria-label="Próxima faixa">
            <NextIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
