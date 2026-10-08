import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteObject } from "../lib/note";
import { canRedo, canUndo, commit, createHistory, redo as redoHistory, undo as undoHistory } from "../lib/noteHistory";
import type { History } from "../lib/noteHistory";
import { newNote } from "../lib/noteMeta";
import { listNotes, readNoteImage, saveNote } from "../lib/tauri";

const SAVE_DELAY_MS = 400;
const imageCache = new Map<string, string>();

/** The note being edited: its objects have an undo history, every change is saved a moment later. */
export function useNoteDoc() {
  const [note, setNote] = useState<Note>(() => newNote(Date.now(), crypto.randomUUID()));
  const [images, setImages] = useState<Record<string, string>>({});
  const [, setTick] = useState(0);
  const noteRef = useRef(note);
  const history = useRef<History<NoteObject[]>>(createHistory([]));
  const timer = useRef(0);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    await saveNote(noteRef.current).catch((e) => console.warn("focusbrew:", e));
  }, []);

  const update = useCallback(
    (next: Note) => {
      noteRef.current = next;
      setNote(next);
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  const refreshImages = useCallback(async (objects: NoteObject[]) => {
    const files = objects.flatMap((o) => (o.type === "image" ? [o.file] : []));
    await Promise.all(
      files.map(async (file) => {
        if (imageCache.has(file)) return;
        try {
          imageCache.set(file, await readNoteImage(file));
        } catch {
          /* a missing file: the picture just does not show */
        }
      }),
    );
    setImages(Object.fromEntries(imageCache));
  }, []);

  /** Opens a note by id (an unknown id starts a new note with it; `null` a new one). Saves the current one first. */
  const load = useCallback(
    async (id: string | null) => {
      await flush();
      let next: Note | undefined;
      if (id) next = (await listNotes().catch(() => [])).find((n) => n.id === id);
      if (!next) next = newNote(Date.now(), id ?? crypto.randomUUID());
      noteRef.current = next;
      history.current = createHistory(next.objects);
      dirty.current = false;
      setNote(next);
      setTick((t) => t + 1);
      await refreshImages(next.objects);
    },
    [flush, refreshImages],
  );

  const setText = useCallback((text: string) => update({ ...noteRef.current, text }), [update]);

  const apply = useCallback(
    (h: History<NoteObject[]>) => {
      history.current = h;
      setTick((t) => t + 1);
      update({ ...noteRef.current, objects: h.present });
    },
    [update],
  );
  const commitObjects = useCallback((objects: NoteObject[]) => apply(commit(history.current, objects)), [apply]);
  const undo = useCallback(() => apply(undoHistory(history.current)), [apply]);
  const redo = useCallback(() => apply(redoHistory(history.current)), [apply]);

  /** A picture was just stored: remember its data URL so it shows at once. */
  const addImageData = useCallback((file: string, dataUrl: string) => {
    imageCache.set(file, dataUrl);
    setImages(Object.fromEntries(imageCache));
  }, []);

  useEffect(() => () => void flush(), [flush]);

  return {
    note,
    images,
    load,
    flush,
    setText,
    commitObjects,
    undo,
    redo,
    canUndo: canUndo(history.current),
    canRedo: canRedo(history.current),
    addImageData,
  };
}
