import { readNoteImage } from "../lib/tauri";

// One cache for every note view (the editor, the drawer, the settings gallery):
// a picture crosses the IPC once, not once per autosave.
const loaded = new Map<string, string>();
const inFlight = new Map<string, Promise<void>>();

/** A picture that was just stored: its data URL is already in hand. */
export function cacheImage(file: string, dataUrl: string): void {
  loaded.set(file, dataUrl);
}

/** `file -> data URL` for these files, reading only the ones not seen yet. A file that cannot be read is left out. */
export async function loadImages(files: string[]): Promise<Record<string, string>> {
  await Promise.all(
    [...new Set(files)].map((file) => {
      if (loaded.has(file)) return undefined;
      let pending = inFlight.get(file);
      if (!pending) {
        pending = readNoteImage(file)
          .then((url) => void loaded.set(file, url))
          .catch(() => {
            /* missing file: the picture just does not show */
          })
          .finally(() => inFlight.delete(file));
        inFlight.set(file, pending);
      }
      return pending;
    }),
  );
  const out: Record<string, string> = {};
  for (const file of files) {
    const url = loaded.get(file);
    if (url) out[file] = url;
  }
  return out;
}

export function resetImageCache(): void {
  loaded.clear();
  inFlight.clear();
}
