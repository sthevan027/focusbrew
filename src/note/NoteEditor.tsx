import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { AppConfig } from "../lib/types";
import { SHEET } from "../lib/note";
import type { NoteObject, Point } from "../lib/note";
import { simplifyPoints } from "../lib/noteGeometry";
import { onNoteFlash } from "../lib/tauri";
import { NOTE_ICONS } from "./noteIcons";
import { NoteSvg } from "./NoteSvg";
import { useNoteDoc } from "./useNoteDoc";
import "./note.css";

export type NoteRequest = { id: string | null; nonce: number };

interface Props {
  /** Which note to show; a new `nonce` shows it again (the shortcut or the history). */
  request: NoteRequest;
  placement: "overlay" | "window";
  config: AppConfig;
  onClose: () => void;
}

export const COLORS = ["#f2f2f3", "#ffd60a", "#ff453a", "#30d158", "#0a84ff", "#ff6bd6"];
export const WIDTHS = [2, 4, 8];

type Mode = "text" | "draw";
type Tool = "pen";

export default function NoteEditor({ request, config, onClose }: Props) {
  const doc = useNoteDoc();
  const [mode, setMode] = useState<Mode>("text");
  const [tool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [widthIdx, setWidthIdx] = useState(1);
  const [live, setLive] = useState<NoteObject[] | null>(null);
  const [flash, setFlash] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draft = useRef<NoteObject | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Open the requested note (and again every time the request changes).
  useEffect(() => {
    void doc.load(request.id).then(() => textRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.nonce]);

  // The shortcut with the note already open: blink.
  useEffect(() => {
    const un = onNoteFlash(() => {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 450);
    });
    return () => void un.then((f) => f());
  }, []);

  const close = useCallback(async () => {
    await doc.flush();
    onClose();
  }, [doc, onClose]);

  const toSheet = (e: ReactPointerEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * SHEET.width) / r.width, ((e.clientY - r.top) * SHEET.height) / r.height];
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSheet(e);
    draft.current = { type: "stroke", color, width: WIDTHS[widthIdx], points: [p] };
    setLive([...doc.note.objects, draft.current]);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = draft.current;
    if (!d || d.type !== "stroke") return;
    const next: NoteObject = { ...d, points: [...d.points, toSheet(e)] };
    draft.current = next;
    setLive([...doc.note.objects, next]);
  };
  const onUp = () => {
    const d = draft.current;
    draft.current = null;
    setLive(null);
    if (d && d.type === "stroke") doc.commitObjects([...doc.note.objects, { ...d, points: simplifyPoints(d.points) }]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      void close();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && mode === "draw") {
      e.preventDefault();
      if (e.shiftKey) doc.redo();
      else doc.undo();
    }
  };

  const shown = live ?? doc.note.objects;
  return (
    <div className={`note-editor${flash ? " flash" : ""}`} tabIndex={-1} onKeyDown={onKeyDown} style={{ ["--accent" as string]: config.accent_color }}>
      <header className="note-bar">
        <button className={mode === "text" ? "note-btn active" : "note-btn"} onClick={() => setMode("text")} title="Escrever">Aa</button>
        <button className={mode === "draw" ? "note-btn active" : "note-btn"} onClick={() => setMode("draw")} title="Desenhar">{NOTE_ICONS.pen()}</button>
        <span className="note-spacer" />
        <button className="note-btn" disabled={!doc.canUndo} onClick={doc.undo} title="Desfazer (Ctrl+Z)">{NOTE_ICONS.undo()}</button>
        <button className="note-btn" disabled={!doc.canRedo} onClick={doc.redo} title="Refazer (Ctrl+Shift+Z)">{NOTE_ICONS.redo()}</button>
        <button className="note-btn" onClick={() => void close()} title="Fechar (Esc)">{NOTE_ICONS.close()}</button>
      </header>
      <div className="note-tools">
        {mode === "draw" ? (
          <>
            {COLORS.map((c) => (
              <button key={c} className={c === color ? "note-swatch active" : "note-swatch"} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Cor ${c}`} />
            ))}
            <span className="note-sep" />
            {WIDTHS.map((w, i) => (
              <button key={w} className={i === widthIdx ? "note-width active" : "note-width"} onClick={() => setWidthIdx(i)} aria-label={`Espessura ${w}`}>
                <i style={{ width: w + 2, height: w + 2 }} />
              </button>
            ))}
          </>
        ) : (
          <span className="note-hint">Escreva aqui. Use o lápis para desenhar.</span>
        )}
      </div>
      <div className={`note-sheet ${mode === "draw" ? "drawing" : "text"} tool-${tool}`}>
        <NoteSvg className="note-layer-images" objects={doc.note.objects} images={doc.images} layer="images" />
        <textarea ref={textRef} className="note-text" value={doc.note.text} maxLength={20000} onChange={(e) => doc.setText(e.currentTarget.value)} spellCheck={false} />
        <NoteSvg
          ref={svgRef}
          className="note-draw"
          objects={shown}
          images={doc.images}
          layer="drawing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
    </div>
  );
}
