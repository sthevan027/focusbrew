import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { canCommit, canSubmitNow, describePreview, isSubmitKey, toCommitItem } from "./lib/capture";
import type { CaptureItem, CapturePreview } from "./lib/capture";
import type { StateSnapshot } from "./lib/types";
import {
  captureCommit,
  capturePreview,
  closeCaptureWindow,
  getState,
  onCaptureOpen,
  onStateChanged,
} from "./lib/tauri";
import "./CaptureWindow.css";

const DEBOUNCE_MS = 150;

/** The capture box: one line of text and a live preview of what Enter will do. */
export default function CaptureWindow() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<CapturePreview | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [pick, setPick] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Answers can arrive out of order: only the latest request may set the preview.
  const requestId = useRef(0);

  // Fresh start: on the first mount and every time the hidden window is shown again.
  const reset = useCallback(() => {
    requestId.current++;
    setText("");
    setPreview(null);
    setPreviewText("");
    setPick(undefined);
    setError(null);
    setBusy(false);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    document.documentElement.style.background = "#0b0b0d";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.background = "#0b0b0d";
    reset();
    getState()
      .then(setSnapshot)
      .catch(() => {});
    const unState = onStateChanged(setSnapshot);
    const unOpen = onCaptureOpen(() => {
      reset();
      getState()
        .then(setSnapshot)
        .catch(() => {});
    });
    return () => {
      void unState.then((f) => f());
      void unOpen.then((f) => f());
    };
  }, [reset]);

  useEffect(() => {
    const id = ++requestId.current;
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      capturePreview(text)
        .then((p) => {
          if (id !== requestId.current) return;
          setPreview(p);
          setPreviewText(text);
          setPick(undefined);
        })
        .catch(() => {
          if (id === requestId.current) setPreview(null);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const commit = (item: CaptureItem | null) => {
    if (!item || busy) return;
    setBusy(true);
    setError(null);
    captureCommit(item)
      .then(() => {
        void closeCaptureWindow();
        reset();
      })
      .catch((e) => {
        setError(String(e));
        setBusy(false);
      });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      void closeCaptureWindow();
    } else if (isSubmitKey({ key: e.key, isComposing: e.nativeEvent.isComposing, targetTag: (e.target as HTMLElement).tagName })) {
      e.preventDefault();
      if (canSubmitNow({ text, previewText, preview, pick, busy })) commit(toCommitItem(preview as CapturePreview, pick));
    }
  };

  const titleOf = (id: string): string => snapshot?.tasks.find((t) => t.id === id)?.title ?? id;
  const parsed = preview?.parsed;
  const pending = text.trim() !== "" && previewText !== text;

  return (
    <div className="capture" onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        className="capture-input"
        autoFocus
        spellCheck={false}
        aria-label="Captura"
        placeholder="Diga ou escreva: tarefa, nota ou tempo"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />

      {preview && parsed && (
        <div className="capture-preview">
          <div className="capture-summary">{describePreview(preview, snapshot?.today)}</div>

          {parsed.kind === "task" && <div className="capture-body">{parsed.title}</div>}
          {parsed.kind === "note" && <div className="capture-body">{parsed.text}</div>}

          {parsed.kind === "unknown" && (
            <>
              <div className="capture-body">{parsed.text}</div>
              <div className="capture-actions">
                <button
                  type="button"
                  className="capture-btn"
                  disabled={busy}
                  onClick={() => commit({ kind: "task", title: parsed.text, project: null, minutes: null, day: null })}
                >
                  Tarefa
                </button>
                <button
                  type="button"
                  className="capture-btn"
                  disabled={busy}
                  onClick={() => commit({ kind: "note", text: parsed.text })}
                >
                  Nota
                </button>
              </div>
            </>
          )}

          {parsed.kind === "set_minutes" && preview.target.kind === "none" && (
            <div className="capture-body">Não há tarefa para mudar o tempo.</div>
          )}
          {parsed.kind === "set_minutes" && preview.target.kind === "one" && (
            <div className="capture-body">{titleOf(preview.target.ids)}</div>
          )}
          {parsed.kind === "set_minutes" && preview.target.kind === "pick" && (
            <div className="capture-picks" role="radiogroup" aria-label="Qual tarefa?">
              {preview.target.ids.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={pick === id}
                  className={pick === id ? "capture-pick selected" : "capture-pick"}
                  onClick={() => setPick(id)}
                >
                  {titleOf(id)}
                </button>
              ))}
            </div>
          )}

          <div className="capture-hint">
            {pending
              ? "calculando…"
              : parsed.kind === "unknown"
                ? "Tab escolhe Tarefa ou Nota, Enter confirma · Esc fecha"
                : parsed.kind === "set_minutes" && preview.target.kind === "pick" && pick === undefined
                  ? "Tab escolhe a tarefa, Enter confirma · Esc fecha"
                  : canCommit(preview, pick)
                    ? "Enter confirma · Esc fecha"
                    : "Esc fecha"}
          </div>
        </div>
      )}

      {pending && !preview && <div className="capture-hint">calculando…</div>}

      {error && (
        <p className="capture-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
