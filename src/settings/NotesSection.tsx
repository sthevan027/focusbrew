import { useState } from "react";
import { deleteNote, openNote } from "../lib/tauri";
import { formatNoteDate, noteTitle } from "../lib/noteMeta";
import type { NotePlacement } from "../lib/types";
import NoteThumb from "../note/NoteThumb";
import { useNotesList } from "../note/NoteHistory";
import "../note/note.css";
import Row from "./Row";
import type { SectionProps } from "./Row";

const PLACEMENTS: { id: NotePlacement; label: string }[] = [
  { id: "overlay", label: "Sobre o painel" },
  { id: "window", label: "Em janela" },
];

export default function NotesSection({ config, set }: SectionProps) {
  const { notes, images } = useNotesList();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <>
      <p className="lead">Rascunhos rápidos para escrever e desenhar. Abra uma nota nova de qualquer lugar com o atalho (em Geral).</p>
      <div className="group">
        <Row title="Abrir a nota" hint="Sobre o painel do widget, ou numa janela no meio do monitor.">
          <div className="segmented" role="radiogroup" aria-label="Onde a nota abre">
            {PLACEMENTS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={config.note_placement === p.id} onClick={() => set({ note_placement: p.id })}>
                {p.label}
              </button>
            ))}
          </div>
        </Row>
      </div>
      <button type="button" className="notes-new" onClick={() => void openNote(null)}>Nova nota</button>
      {notes.length === 0 ? (
        <p className="empty">Nenhuma nota ainda.</p>
      ) : (
        <div className="notes-grid">
          {notes.map((n) => (
            <div key={n.id} className="notes-card">
              <button type="button" className="notes-open" onClick={() => void openNote(n.id)}>
                <NoteThumb note={n} images={images} />
                <strong>{noteTitle(n)}</strong>
                <span>{formatNoteDate(n.updated_ms)}</span>
              </button>
              {confirming === n.id ? (
                <span className="notes-confirm">
                  Apagar?
                  <button type="button" onClick={() => { void deleteNote(n.id); setConfirming(null); }}>Sim</button>
                  <button type="button" onClick={() => setConfirming(null)}>Não</button>
                </span>
              ) : (
                <button type="button" className="notes-del" aria-label="Apagar a nota" onClick={() => setConfirming(n.id)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
