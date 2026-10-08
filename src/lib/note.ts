/** The drawing sheet, in the units every object coordinate uses. */
export const SHEET = { width: 560, height: 320 } as const;

export type ShapeKind = "rect" | "ellipse" | "triangle" | "line" | "arrow";
export type Point = [number, number];

export type NoteObject =
  | { type: "stroke"; color: string; width: number; points: Point[] }
  | { type: "shape"; kind: ShapeKind; color: string; width: number; fill: boolean; x1: number; y1: number; x2: number; y2: number }
  | { type: "image"; file: string; x: number; y: number; w: number; h: number };

export interface Note {
  id: string;
  created_ms: number;
  updated_ms: number;
  text: string;
  objects: NoteObject[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
