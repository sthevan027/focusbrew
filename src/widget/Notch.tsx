import type { StateSnapshot } from "../lib/types";
import { clockParts, formatClock, remainingSecs } from "../lib/progress";
import { ClockIcon } from "./icons";

interface Props {
  state: StateSnapshot;
  now: number;
}

/**
 * What goes inside the closed shape. Parked: nothing (the shape is the bar).
 * Running or paused: Standard shows the countdown and the task on the top
 * edge, or just the countdown in the standing bar on the left/right edges;
 * Minimal nothing.
 */
export default function Notch({ state, now }: Props) {
  const { timer, config, tasks } = state;
  if (timer.status === "idle" || config.notch_style !== "standard") return null;

  const left = remainingSecs(timer, now);

  if (config.widget_edge !== "top") {
    const { minutes, seconds } = clockParts(left);
    return (
      <div className={`notch-box side ${config.side_count_style} ${timer.status}`}>
        <ClockIcon size={config.side_count_style === "stacked" ? 12 : 13} />
        {config.side_count_style === "stacked" ? (
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

  const task = tasks.find((t) => t.id === timer.task_id);
  return (
    <div className={`notch-box ${timer.status}`}>
      <span className="notch-clock">
        <ClockIcon />
        <span className="notch-time">{formatClock(left)}</span>
      </span>
      <span className="notch-title">{task?.title ?? ""}</span>
    </div>
  );
}
