import type { StateSnapshot } from "../lib/types";
import ProgressLine from "./ProgressLine";

interface Props {
  state: StateSnapshot;
  now: number;
  onHold: (hold: boolean) => void;
}

export default function TodoPanel({ state, now }: Props) {
  const { timer, config } = state;
  return (
    <div className="panel">
      <ProgressLine
        timer={timer}
        now={now}
        rgb={config.rgb_line}
        visible={config.progress_line && timer.status !== "idle"}
      />
    </div>
  );
}
