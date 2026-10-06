import type { StateSnapshot } from "../lib/types";
import { formatClock, remainingSecs } from "../lib/progress";
import { ClockIcon } from "./icons";

interface Props {
  state: StateSnapshot;
  now: number;
}

/**
 * What goes inside the closed shape. Parked: nothing (the shape is the bar).
 * Running or paused: Standard shows the countdown and the task; Minimal nothing.
 */
export default function Notch({ state, now }: Props) {
  const { timer, config, tasks } = state;
  if (timer.status === "idle" || config.notch_style !== "standard") return null;

  const task = tasks.find((t) => t.id === timer.task_id);
  return (
    <div className={`notch-box ${timer.status}`}>
      <span className="notch-clock">
        <ClockIcon />
        <span className="notch-time">{formatClock(remainingSecs(timer, now))}</span>
      </span>
      <span className="notch-title">{task?.title ?? ""}</span>
    </div>
  );
}
