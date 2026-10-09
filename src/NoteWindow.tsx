import { useEffect, useState } from "react";
import type { AppConfig } from "./lib/types";
import { closeNoteWindow, getState, onOpenNote, onStateChanged } from "./lib/tauri";
import NoteEditor from "./note/NoteEditor";
import type { NoteRequest } from "./note/NoteEditor";

function initialRequest(): NoteRequest {
  const id = new URLSearchParams(window.location.search).get("note");
  return { id: id && id !== "new" ? id : null, nonce: 0 };
}

/** The quick note in its own window. */
export default function NoteWindow() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [request, setRequest] = useState<NoteRequest>(initialRequest);

  useEffect(() => {
    document.documentElement.style.background = "#0b0b0d";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.background = "#0b0b0d";
    getState().then((s) => setConfig(s.config));
    const unState = onStateChanged((s) => setConfig(s.config));
    const unOpen = onOpenNote((id) => setRequest((r) => ({ id, nonce: r.nonce + 1 })));
    return () => {
      void unState.then((f) => f());
      void unOpen.then((f) => f());
    };
  }, []);

  if (!config) return null;
  return <NoteEditor request={request} placement="window" config={config} onClose={() => void closeNoteWindow()} />;
}
