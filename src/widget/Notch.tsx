import type { StateSnapshot } from "../lib/types";
import { notchLayout } from "../lib/notch";
import { clockParts, formatClock, remainingSecs } from "../lib/progress";
import { useThemeFeatures } from "../themes/ThemeContext";
import { ClockIcon } from "./icons";
import MediaBox from "./MediaBox";
import Pumpkin from "./Pumpkin";
import MediaControls from "./MediaControls";
import type { BoxTab } from "./mediaTabs";

interface Props {
  state: StateSnapshot;
  now: number;
  /** Which of the two things the box shows when both have something (task by default). */
  activeTab: BoxTab;
}

/**
 * What goes inside the closed shape. Parked: nothing (the shape is the bar).
 * Running or paused, by `notchLayout`: Standard on the top has the countdown on
 * one side and the task on the other; Minimal has only the countdown, centered.
 * On the left/right edges the standing bar shows just the countdown.
 * With media playing and the media tab active, the box shows the media instead.
 */
export default function Notch({ state, now, activeTab }: Props) {
  const { mascot } = useThemeFeatures();
  const { timer, config, tasks, media } = state;
  if (activeTab === "media" && media) return <MediaBox media={media} />;
  if (timer.status === "idle") return null;

  const layout = notchLayout(config.notch_style, config.widget_edge);
  const left = remainingSecs(timer, now);
  // With the pumpkin theme the clock is the pumpkin: mouth open while it runs, eyes shut when paused.
  const clock =
    mascot === "pumpkin" ? (
      <Pumpkin face={timer.status === "paused" ? "closed" : "open"} className="notch-pumpkin" />
    ) : null;

  if (layout === "side-icon" || layout === "side-plain") {
    const { minutes, seconds } = clockParts(left);
    const stacked = config.side_count_style === "stacked";
    return (
      <div className={`notch-box side ${config.side_count_style} ${timer.status}`}>
        {layout === "side-icon" && (clock ?? <ClockIcon size={stacked ? 12 : 13} />)}
        {stacked ? (
          <span className="notch-time side-time">
            <span>{minutes}</span>
            <span>{seconds}</span>
          </span>
        ) : (
          <span className="notch-time side-time">{`${minutes}:${seconds}`}</span>
        )}
      </div>
    );
  }

  if (layout === "center") {
    return (
      <div className={`notch-box center ${timer.status}`}>
        <span className="notch-time">{formatClock(left)}</span>
      </div>
    );
  }

  const task = tasks.find((t) => t.id === timer.task_id);
  const showControls = Boolean(media) && config.notch_media_controls;
  return (
    <div className={`notch-box ${timer.status}`}>
      <span className="notch-clock">
        {clock ?? <ClockIcon />}
        <span className="notch-time">{formatClock(left)}</span>
      </span>
      <span className={showControls ? "notch-title grow" : "notch-title"}>{task?.title ?? ""}</span>
      {showControls && media && <MediaControls playing={media.status === "playing"} />}
    </div>
  );
}
