import type { MediaView } from "../lib/types";
import MediaControls from "./MediaControls";
import { MusicNoteIcon } from "./icons";

/**
 * The media shape: cover, progress and the transport controls, from whatever
 * app Windows is playing.
 */
export default function MediaBox({ media }: { media: MediaView }) {
  const pct = media.duration_secs > 0 ? (media.position_secs / media.duration_secs) * 100 : 0;

  return (
    <div className="notch-box media">
      <div className="media-cover">
        {media.cover_data_url ? <img src={media.cover_data_url} alt="" /> : <MusicNoteIcon size={16} />}
        <div className="media-progress" style={{ width: `${pct}%` }} />
      </div>
      <span className="media-title">{media.title}</span>
      <MediaControls playing={media.status === "playing"} />
    </div>
  );
}
