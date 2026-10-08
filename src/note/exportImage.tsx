import { renderToStaticMarkup } from "react-dom/server";
import { SHEET } from "../lib/note";
import type { Note } from "../lib/note";
import { wrapText } from "../lib/noteMeta";
import { NoteSvg } from "./NoteSvg";

const SCALE = 2;

async function drawLayer(ctx: CanvasRenderingContext2D, note: Note, images: Record<string, string>, layer: "images" | "drawing") {
  const markup = renderToStaticMarkup(<NoteSvg objects={note.objects} images={images} layer={layer} />);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg"));
      img.src = url;
    });
    ctx.drawImage(img, 0, 0, SHEET.width, SHEET.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws the whole sheet (pictures, text, drawing) on a dark background and puts it on the clipboard as a PNG. */
export async function copyNoteAsImage(note: Note, images: Record<string, string>): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = SHEET.width * SCALE;
  canvas.height = SHEET.height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, SHEET.width, SHEET.height);
  await drawLayer(ctx, note, images, "images");
  ctx.fillStyle = "#f2f2f3";
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = "top";
  wrapText(note.text, SHEET.width - 24, (s) => ctx.measureText(s).width).forEach((line, i) => ctx.fillText(line, 12, 12 + i * 20));
  await drawLayer(ctx, note, images, "drawing");
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
