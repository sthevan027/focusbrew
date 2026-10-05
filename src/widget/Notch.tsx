import type { StateSnapshot } from "../lib/types";
import { formatClock, remainingSecs } from "../lib/progress";
import { ClockIcon } from "./icons";
import ProgressLine from "./ProgressLine";

interface Props {
  state: StateSnapshot;
  now: number;
}

/**
 * Parked: a flat black bar at the very top of the screen, nothing inside.
 * Running or paused: a black box with rounded bottom corners and the progress
 * line around it. Standard shows the countdown and the task; Minimal only the box.
 */
export default function Notch({ state, now }: Props) {
  const { timer, config, tasks } = state;
  if (timer.status === "idle") return <div className="notch-idle" />;

  const task = tasks.find((t) => t.id === timer.task_id);
  return (
    <div className={`notch-box ${timer.status}`}>
      {config.notch_style === "standard" && (
        <>
          <span className="notch-clock">
            <ClockIcon />
            <span className="notch-time">{formatClock(remainingSecs(timer, now))}</span>
          </span>
          <span className="notch-title">{task?.title ?? ""}</span>
        </>
      )}
      <ProgressLine timer={timer} now={now} rgb={config.rgb_line} visible={config.progress_line} />
    </div>
  );
}
