import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { StateSnapshot } from "./lib/types";
import { getState, onStateChanged, setWidgetExpanded } from "./lib/tauri";
import { SCALE_FACTOR } from "./lib/scale";
import Notch from "./widget/Notch";
import TodoPanel from "./widget/TodoPanel";
import { useHoverOpen, useNow } from "./widget/hooks";
import "./Widget.css";

export default function Widget() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const hover = useHoverOpen((open) => {
    void setWidgetExpanded(open);
  });
  const now = useNow(state?.timer.status === "running");

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

  const style = {
    "--accent": state.config.accent_color,
    "--s": SCALE_FACTOR[state.config.widget_scale],
  } as CSSProperties;

  return (
    <div
      className="widget-root"
      style={style}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <div className="scaled">
        {hover.open ? (
          <TodoPanel state={state} now={now} onHold={hover.setHolding} />
        ) : (
          <Notch state={state} now={now} />
        )}
      </div>
    </div>
  );
}
