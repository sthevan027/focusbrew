import type { Note } from "./note";

const pad = (n: number) => String(n).padStart(2, "0");

/** "08/10 14:05" (local time). */
export function formatNoteDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The first non-empty line of the text; a note with only drawing is "Desenho · date". */
export function noteTitle(note: Pick<Note, "text" | "objects" | "updated_ms">): string {
  const line = note.text.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  if (line) return line.length > 60 ? `${line.slice(0, 57)}…` : line;
  return note.objects.length > 0 ? `Desenho · ${formatNoteDate(note.updated_ms)}` : "Nota vazia";
}

export function newNote(now: number, id: string): Note {
  return { id, created_ms: now, updated_ms: now, text: "", objects: [] };
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Notes whose text contains `query`, ignoring case and accents. */
export function filterNotes<T extends Pick<Note, "text">>(notes: T[], query: string): T[] {
  const q = fold(query.trim());
  return q ? notes.filter((n) => fold(n.text).includes(q)) : notes;
}

/** Shrinks (never enlarges) a size so its longest side is at most `max`. */
export function scaleToMax(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Fits an image into a box keeping its proportion, never enlarging it. */
export function fitInto(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Breaks text into lines no wider than `maxWidth` (by the measuring function); blank lines stay. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}
