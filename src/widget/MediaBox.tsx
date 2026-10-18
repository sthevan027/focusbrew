import { useEffect, useRef, useState } from "react";
import type { MediaView } from "../lib/types";
import MediaControls from "./MediaControls";
import { MusicNoteIcon } from "./icons";

/**
 * The media shape: cover, progress and the transport controls, from whatever
 * app Windows is playing.
 */
export default function MediaBox({ media }: { media: MediaView }) {
  const playing = media.status === "playing";
  const [now, setNow] = useState(() => Date.now());
  const lastUpdatedRef = useRef(Date.now());

  useEffect(() => {
    lastUpdatedRef.current = Date.now();
  }, [media.position_secs, media.duration_secs, media.status, media.title]);

  useEffect(() => {
    if (!playing) return;

    let rafId = 0;
    const tick = () => {
      setNow(Date.now());
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [playing]);

  const livePosition = playing ? media.position_secs + (now - lastUpdatedRef.current) / 1000 : media.position_secs;
  const pct = media.duration_secs > 0 ? (Math.min(livePosition, media.duration_secs) / media.duration_secs) * 100 : 0;

  return (
    <div className="notch-box media">
      <div className="media-cover">
        {media.cover_data_url ? <img src={media.cover_data_url} alt="" /> : <MusicNoteIcon size={16} />}
        <div className="media-progress" style={{ width: `${pct}%` }} />
      </div>
      <span className="media-title">{media.title}</span>
      <MediaControls playing={playing} />
    </div>
  );
}
