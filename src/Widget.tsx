import { useEffect, useState } from "react";
import type { StateSnapshot } from "./lib/types";
import { getState, onStateChanged } from "./lib/tauri";

export default function Widget() {
  const [state, setState] = useState<StateSnapshot | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) return null;
  return <div style={{ background: "#000", color: "#f2f2f3", font: "11px sans-serif" }}>{state.timer.status}</div>;
}
