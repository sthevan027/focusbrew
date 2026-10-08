import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { AppConfig } from "../lib/types";
import { SHEET } from "../lib/note";
import type { NoteObject, Point, Rect, ShapeKind } from "../lib/note";
import {
  constrainShape,
  fitObject,
  hitHandle,
  objectBounds,
  resizeRect,
  simplifyPoints,
  topObjectAt,
  translateObject,
} from "../lib/noteGeometry";
import type { Handle } from "../lib/noteGeometry";
import { fitInto } from "../lib/noteMeta";
import { onNoteFlash, readImageFile, saveNoteImage } from "../lib/tauri";
import { copyNoteAsImage } from "./exportImage";
import { blobFromBase64, prepareImage } from "./imageImport";
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
type Tool = "select" | "pen" | ShapeKind | "eraser";

const TOOLS: Tool[] = ["select", "pen", "rect", "ellipse", "triangle", "line", "arrow", "eraser"];
const TOOL_TITLES: Record<Tool, string> = {
  select: "Selecionar (mover, redimensionar, Delete)",
  pen: "Caneta",
  rect: "Quadrado (Shift = proporcional)",
  ellipse: "Círculo (Shift = proporcional)",
  triangle: "Triângulo",
  line: "Linha (Shift = ângulos de 45°)",
  arrow: "Seta (Shift = ângulos de 45°)",
  eraser: "Borracha",
};

type Gesture =
  | { kind: "draw"; draft: NoteObject }
  | { kind: "erase"; objects: NoteObject[] }
  | { kind: "move"; start: Point; index: number; original: NoteObject[] }
  | { kind: "resize"; index: number; handle: Handle; from: Rect; original: NoteObject[] };

export default function NoteEditor({ request, config, onClose }: Props) {
  const doc = useNoteDoc();
  const [mode, setMode] = useState<Mode>("text");
  const [tool, setTool] = useState<Tool>("pen");
  const [fill, setFill] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [widthIdx, setWidthIdx] = useState(1);
  const [live, setLiveState] = useState<NoteObject[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<NoteObject[] | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const setLive = (objects: NoteObject[] | null) => {
    liveRef.current = objects;
    setLiveState(objects);
  };

  // Open the requested note (and again every time the request changes).
  useEffect(() => {
    setSelected(null);
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

  // An undo can take away the selected object.
  const objects = doc.note.objects;
  useEffect(() => {
    if (selected !== null && selected >= objects.length) setSelected(null);
  }, [objects.length, selected]);

  const say = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  // A picture from the clipboard or from a dropped file: shrunk, stored, and placed in the middle, selected.
  const importBlob = async (blob: Blob) => {
    if (doc.note.objects.filter((o) => o.type === "image").length >= 10) return say("Máximo de 10 imagens por nota");
    try {
      const img = await prepareImage(blob);
      const file = await saveNoteImage(img.base64, img.ext);
      doc.addImageData(file, img.dataUrl);
      const size = fitInto(img.w, img.h, 300, 220);
      const object: NoteObject = { type: "image", file, x: (SHEET.width - size.w) / 2, y: (SHEET.height - size.h) / 2, w: size.w, h: size.h };
      const at = doc.note.objects.length; // the new object goes last
      doc.commitObjects([...doc.note.objects, object]);
      setMode("draw");
      setTool("select");
      setSelected(at);
    } catch (e) {
      say(`Não deu para usar a imagem: ${String(e)}`);
    }
  };
  const importRef = useRef(importBlob);
  importRef.current = importBlob;

  // Files dropped on the window arrive as paths through Tauri.
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") return;
      for (const path of event.payload.paths) {
        try {
          const file = await readImageFile(path);
          await importRef.current(await blobFromBase64(file.ext, file.data_base64));
        } catch {
          say("Esse arquivo não é uma imagem aceita");
        }
      }
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

  const eraseAt = (g: Extract<Gesture, { kind: "erase" }>, p: Point) => {
    const i = topObjectAt(g.objects, p[0], p[1], 6, true);
    if (i >= 0) {
      g.objects = g.objects.filter((_, k) => k !== i);
      setLive(g.objects);
    }
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSheet(e);
    if (tool === "select") {
      if (selected !== null && objects[selected]) {
        const handle = hitHandle(objectBounds(objects[selected]), p[0], p[1]);
        if (handle) {
          gesture.current = { kind: "resize", index: selected, handle, from: objectBounds(objects[selected]), original: objects };
          return;
        }
      }
      const i = topObjectAt(objects, p[0], p[1]);
      setSelected(i >= 0 ? i : null);
      if (i >= 0) gesture.current = { kind: "move", start: p, index: i, original: objects };
    } else if (tool === "eraser") {
      const g: Gesture = { kind: "erase", objects };
      gesture.current = g;
      eraseAt(g, p);
    } else if (tool === "pen") {
      const d: NoteObject = { type: "stroke", color, width: WIDTHS[widthIdx], points: [p] };
      gesture.current = { kind: "draw", draft: d };
      setLive([...objects, d]);
    } else {
      const d: NoteObject = { type: "shape", kind: tool, color, width: WIDTHS[widthIdx], fill, x1: p[0], y1: p[1], x2: p[0], y2: p[1] };
      gesture.current = { kind: "draw", draft: d };
      setLive([...objects, d]);
    }
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toSheet(e);
    if (g.kind === "draw") {
      const d = g.draft;
      if (d.type === "stroke") {
        g.draft = { ...d, points: [...d.points, p] };
      } else if (d.type === "shape") {
        const [x2, y2] = constrainShape(d.kind, d.x1, d.y1, p[0], p[1], e.shiftKey);
        g.draft = { ...d, x2, y2 };
      }
      setLive([...objects, g.draft]);
    } else if (g.kind === "move") {
      const [dx, dy] = [p[0] - g.start[0], p[1] - g.start[1]];
      setLive(g.original.map((o, i) => (i === g.index ? translateObject(o, dx, dy) : o)));
    } else if (g.kind === "resize") {
      const to = resizeRect(g.from, g.handle, p[0], p[1]);
      setLive(g.original.map((o, i) => (i === g.index ? fitObject(o, g.from, to) : o)));
    } else {
      eraseAt(g, p);
    }
  };

  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    const result = liveRef.current;
    setLive(null);
    if (!g) return;
    if (g.kind === "draw") {
      let d = g.draft;
      if (d.type === "stroke") d = { ...d, points: simplifyPoints(d.points) };
      if (d.type === "shape" && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 3) return; // a click, not a shape
      doc.commitObjects([...objects, d]);
    } else if (result) {
      doc.commitObjects(result);
      if (g.kind === "erase") setSelected(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      void close();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && mode === "draw") {
      e.preventDefault();
      if (e.shiftKey) doc.redo();
      else doc.undo();
    } else if (e.key === "Delete" && mode === "draw" && selected !== null && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      doc.commitObjects(objects.filter((_, i) => i !== selected));
      setSelected(null);
    }
  };

  const shown = live ?? objects;
  const selectedObject = tool === "select" && selected !== null ? shown[selected] : undefined;
  return (
    <div className={`note-editor${flash ? " flash" : ""}`} tabIndex={-1} onKeyDown={onKeyDown}
      onPaste={(e) => {
        const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
        if (file) {
          e.preventDefault();
          void importBlob(file);
        }
      }}
      style={{ ["--accent" as string]: config.accent_color }}>
      <header className="note-bar">
        <button className={mode === "text" ? "note-btn active" : "note-btn"} onClick={() => setMode("text")} title="Escrever">Aa</button>
        <button className={mode === "draw" ? "note-btn active" : "note-btn"} onClick={() => setMode("draw")} title="Desenhar">{NOTE_ICONS.pen()}</button>
        <span className="note-spacer" />
        <button
          className="note-btn"
          onClick={() => void copyNoteAsImage(doc.note, doc.images).then(() => say("Copiado como imagem"), () => say("Não consegui copiar"))}
          title="Copiar como imagem"
        >
          {NOTE_ICONS.copy()}
        </button>
        <button className="note-btn" disabled={!doc.canUndo} onClick={doc.undo} title="Desfazer (Ctrl+Z)">{NOTE_ICONS.undo()}</button>
        <button className="note-btn" disabled={!doc.canRedo} onClick={doc.redo} title="Refazer (Ctrl+Shift+Z)">{NOTE_ICONS.redo()}</button>
        <button className="note-btn" onClick={() => void close()} title="Fechar (Esc)">{NOTE_ICONS.close()}</button>
      </header>
      <div className="note-tools">
        {mode === "draw" ? (
          <>
            {TOOLS.map((t) => (
              <button
                key={t}
                className={t === tool ? "note-btn active" : "note-btn"}
                onClick={() => {
                  setTool(t);
                  setSelected(null);
                }}
                title={TOOL_TITLES[t]}
              >
                {NOTE_ICONS[t]()}
              </button>
            ))}
            <button className={fill ? "note-btn active" : "note-btn"} onClick={() => setFill((f) => !f)} title="Preencher formas">{NOTE_ICONS.fill()}</button>
            <span className="note-sep" />
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
        <NoteSvg className="note-layer-images" objects={shown} images={doc.images} layer="images" />
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
        >
          {selectedObject && (() => {
            const b = objectBounds(selectedObject);
            const corners: Point[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
            return (
              <g pointerEvents="none">
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#0a84ff" strokeDasharray="4 3" />
                {corners.map(([x, y], i) => (
                  <rect key={i} x={x - 4} y={y - 4} width={8} height={8} fill="#fff" stroke="#0a84ff" />
                ))}
              </g>
            );
          })()}
        </NoteSvg>
        {toast && <div className="note-toast">{toast}</div>}
      </div>
    </div>
  );
}
