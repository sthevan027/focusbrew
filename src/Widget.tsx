import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { StateSnapshot } from "./lib/types";
import { getState, onStateChanged, setWidgetExpanded } from "./lib/tauri";
import { SCALE_FACTOR } from "./lib/scale";
import { hitSize, shellSize } from "./lib/shell";
import type { PanelPhase } from "./lib/shell";
import Notch from "./widget/Notch";
import ProgressLine from "./widget/ProgressLine";
import TodoPanel from "./widget/TodoPanel";
import { useHoverOpen, useNow } from "./widget/hooks";
import "./Widget.css";

/** Must match the `.shell.closing` transition in Widget.css. */
const CLOSE_MS = 200;

export default function Widget() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [phase, setPhase] = useState<PanelPhase>("closed");
  const seq = useRef(0);

  // The window is always panel-sized and never resizes; every change is the
  // shape animating inside it. `setWidgetExpanded` only tells the backend
  // whether the whole window takes the mouse (open) or just the shape.
  const hover = useHoverOpen(
    (open) => {
      const id = ++seq.current;
      void setWidgetExpanded(open);
      if (open) {
        setPhase("open");
      } else {
        setPhase("closing");
        window.setTimeout(() => {
          if (seq.current === id) setPhase("closed");
        }, CLOSE_MS);
      }
    },
    90,
    160,
  );
  const now = useNow(state?.timer.status === "running", state?.timer.deadline_ms ?? 0);

  useEffect(() => {
    // Inline and in this window only (the settings window shares the bundle):
    // a transparent, margin-less, non-scrolling page behind the notch.
    for (const el of [document.documentElement, document.body, document.getElementById("root")]) {
      if (!el) continue;
      el.style.background = "transparent";
      el.style.margin = "0";
      el.style.padding = "0";
      el.style.overflow = "hidden";
    }
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) return null;

  const { timer, config } = state;
  const style = {
    "--accent": config.accent_color,
    "--s": SCALE_FACTOR[config.widget_scale],
  } as CSSProperties;
  const size = shellSize(timer.status, phase);
  const hit = hitSize(timer.status, phase);

  return (
    <div className="widget-root" style={style}>
      <div className="scaled">
        <div
          className="hit"
          style={{ width: hit.width, height: hit.height }}
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
        >
          <div
            className={`shell ${phase} ${timer.status}`}
            style={{ width: size.width, height: size.height }}
          >
            {phase === "closed" ? (
              <Notch state={state} now={now} />
            ) : (
              <TodoPanel state={state} now={now} onHold={hover.setHolding} />
            )}
            <ProgressLine
              timer={timer}
              now={now}
              rgb={config.rgb_line}
              visible={config.progress_line && timer.status !== "idle"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
