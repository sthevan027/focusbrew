import type { StateSnapshot } from "../lib/types";
import { notchLayout } from "../lib/notch";
import { clockParts, formatClock, remainingSecs } from "../lib/progress";
import { ClockIcon } from "./icons";

interface Props {
  state: StateSnapshot;
  now: number;
}

/**
 * What goes inside the closed shape. Parked: nothing (the shape is the bar).
 * Running or paused, by `notchLayout`: Standard on the top has the countdown on
 * one side and the task on the other; Minimal has only the countdown, centered.
 * On the left/right edges the standing bar shows just the countdown.
 */
export default function Notch({ state, now }: Props) {
  const { timer, config, tasks } = state;
  if (timer.status === "idle") return null;

  const layout = notchLayout(config.notch_style, config.widget_edge);
  const left = remainingSecs(timer, now);

  if (layout === "side-icon" || layout === "side-plain") {
    const { minutes, seconds } = clockParts(left);
    const stacked = config.side_count_style === "stacked";
    return (
      <div className={`notch-box side ${config.side_count_style} ${timer.status}`}>
        {layout === "side-icon" && <ClockIcon size={stacked ? 12 : 13} />}
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
