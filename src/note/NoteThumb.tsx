import type { Note } from "../lib/note";
import { NoteSvg } from "./NoteSvg";

/** A small picture of a note: the drawing and the first lines of text. */
export default function NoteThumb({ note, images }: { note: Note; images: Record<string, string> }) {
  return (
    <div className="note-thumb">
      <NoteSvg objects={note.objects} images={images} />
      <p>{note.text.trim().slice(0, 90)}</p>
    </div>
  );
}
