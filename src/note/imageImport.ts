import { scaleToMax } from "../lib/noteMeta";

export const MAX_SIDE = 1600;

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Shrinks a picture to at most 1600 px on its longest side and re-encodes it (PNG, or JPEG for a JPEG). */
export async function prepareImage(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const { w, h } = scaleToMax(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const jpeg = blob.type === "image/jpeg";
  const out = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), jpeg ? "image/jpeg" : "image/png", 0.9),
  );
  const base64 = await blobToBase64(out);
  const ext = jpeg ? ("jpg" as const) : ("png" as const);
  return { ext, base64, dataUrl: `data:${jpeg ? "image/jpeg" : "image/png"};base64,${base64}`, w, h };
}

/** A file read by the backend (extension + base64) as a Blob the browser can decode. */
export async function blobFromBase64(ext: string, base64: string): Promise<Blob> {
  const type = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/png";
  return (await fetch(`data:${type};base64,${base64}`)).blob();
}
