import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import NoteWindow from "./NoteWindow";
import Widget from "./Widget";
import { currentWindowLabel } from "./lib/tauri";

function windowKind(): "widget" | "note" | "settings" {
  try {
    const label = currentWindowLabel();
    return label === "widget" ? "widget" : label === "note" ? "note" : "settings";
  } catch {
    // Not running inside a Tauri webview (e.g. a plain browser tab hitting
    // the Vite dev server directly) — fall back to the main dashboard.
    return "settings";
  }
}

const kind = windowKind();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{kind === "widget" ? <Widget /> : kind === "note" ? <NoteWindow /> : <App />}</React.StrictMode>,
);
