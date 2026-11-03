import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CaptureWindow from "./CaptureWindow";
import NoteWindow from "./NoteWindow";
import Widget from "./Widget";
import { currentWindowLabel } from "./lib/tauri";

function windowKind(): "widget" | "note" | "capture" | "settings" {
  try {
    const label = currentWindowLabel();
    return label === "widget" ? "widget" : label === "note" ? "note" : label === "capture" ? "capture" : "settings";
  } catch {
    // Not running inside a Tauri webview (e.g. a plain browser tab hitting
    // the Vite dev server directly) — fall back to the main dashboard.
    return "settings";
  }
}

const kind = windowKind();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {kind === "widget" ? <Widget /> : kind === "note" ? <NoteWindow /> : kind === "capture" ? <CaptureWindow /> : <App />}
  </React.StrictMode>,
);
