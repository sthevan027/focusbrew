import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Widget from "./Widget";
import { currentWindowLabel } from "./lib/tauri";

function resolveIsWidget(): boolean {
  try {
    return currentWindowLabel() === "widget";
  } catch {
    // Not running inside a Tauri webview (e.g. a plain browser tab hitting
    // the Vite dev server directly) — fall back to the main dashboard.
    return false;
  }
}

const isWidget = resolveIsWidget();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isWidget ? <Widget /> : <App />}</React.StrictMode>,
);
