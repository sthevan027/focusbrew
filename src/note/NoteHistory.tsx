import { useEffect, useState } from "react";
import type { Note } from "../lib/note";
import { filterNotes, formatNoteDate, noteTitle } from "../lib/noteMeta";
import { deleteNote, listNotes, onNotesChanged, readNoteImage } from "../lib/tauri";
import { NOTE_ICONS } from "./noteIcons";
import NoteThumb from "./NoteThumb";

/** The saved notes (most recent first), kept up to date, with the pictures they use loaded. */
export function useNotesList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await listNotes().catch(() => [] as Note[]);
      if (!alive) return;
      setNotes(list);
      const files = list.flatMap((n) => n.objects.flatMap((o) => (o.type === "image" ? [o.file] : [])));
      const loaded: Record<string, string> = {};
      await Promise.all(
        files.map(async (f) => {
          try {
            loaded[f] = await readNoteImage(f);
          } catch {
            /* missing file: the thumbnail just lacks it */
          }
        }),
      );
      if (alive) setImages((old) => ({ ...old, ...loaded }));
    };
    void load();
    const un = onNotesChanged(() => void load());
    return () => {
      alive = false;
      void un.then((f) => f());
    };
  }, []);

  return { notes, images };
}

/** The list that slides over the sheet: filter, open, delete (with a quiet confirmation). */
export default function NoteHistory({ currentId, onPick, onNew }: { currentId: string; onPick: (id: string) => void; onNew: () => void }) {
  const { notes, images } = useNotesList();
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const shown = filterNotes(notes, query);

  return (
    <aside
      className="note-history"
      onKeyDown={(e) => {
        if (e.key === "Escape" && confirming) {
          e.stopPropagation();
          setConfirming(null);
        }
      }}
    >
      <div className="note-history-head">
        <input autoFocus placeholder="Filtrar notas…" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <button className="note-btn" onClick={onNew} title="Nota nova (Ctrl+N)">{NOTE_ICONS.plus()}</button>
      </div>
      <div className="note-history-list">
        {shown.length === 0 && <p className="note-hint">{notes.length === 0 ? "Nenhuma nota salva ainda." : "Nada encontrado."}</p>}
        {shown.map((n) => (
          <div key={n.id} className={n.id === currentId ? "note-item current" : "note-item"}>
            <button className="note-item-open" onClick={() => onPick(n.id)}>
              <NoteThumb note={n} images={images} />
              <span className="note-item-title">{noteTitle(n)}</span>
              <span className="note-item-date">{formatNoteDate(n.updated_ms)}</span>
            </button>
            {confirming === n.id ? (
              <span className="note-confirm">
                Apagar?
                <button onClick={() => { void deleteNote(n.id); setConfirming(null); }}>Sim</button>
                <button onClick={() => setConfirming(null)}>Não</button>
              </span>
            ) : (
              <button className="note-btn note-item-del" onClick={() => setConfirming(n.id)} title="Apagar">{NOTE_ICONS.close()}</button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
