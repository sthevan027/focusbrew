import type { NoteObject, Point, Rect, ShapeKind } from "./note";

export type Handle = "nw" | "ne" | "sw" | "se";

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Distance from (px, py) to the segment a-b. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

/** Drops points closer than `minDist` to the last kept one; the ends stay. */
export function simplifyPoints(points: Point[], minDist = 1.5): Point[] {
  if (points.length <= 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (dist(points[i][0], points[i][1], last[0], last[1]) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function objectBounds(o: NoteObject): Rect {
  if (o.type === "image") return { x: o.x, y: o.y, w: o.w, h: o.h };
  if (o.type === "shape") return normRect(o.x1, o.y1, o.x2, o.y2);
  if (o.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = o.points.map((p) => p[0]);
  const ys = o.points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function translateObject(o: NoteObject, dx: number, dy: number): NoteObject {
  if (o.type === "image") return { ...o, x: o.x + dx, y: o.y + dy };
  if (o.type === "shape") return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
  return { ...o, points: o.points.map(([x, y]): Point => [x + dx, y + dy]) };
}

/** Maps the object from the box `from` to the box `to` (move + scale). */
export function fitObject(o: NoteObject, from: Rect, to: Rect): NoteObject {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  const mx = (x: number) => to.x + (x - from.x) * sx;
  const my = (y: number) => to.y + (y - from.y) * sy;
  if (o.type === "image") return { ...o, x: mx(o.x), y: my(o.y), w: o.w * sx, h: o.h * sy };
  if (o.type === "shape") return { ...o, x1: mx(o.x1), y1: my(o.y1), x2: mx(o.x2), y2: my(o.y2) };
  return { ...o, points: o.points.map(([x, y]): Point => [mx(x), my(y)]) };
}

export function hitHandle(b: Rect, x: number, y: number, size = 9): Handle | null {
  const corners: [Handle, number, number][] = [
    ["nw", b.x, b.y],
    ["ne", b.x + b.w, b.y],
    ["sw", b.x, b.y + b.h],
    ["se", b.x + b.w, b.y + b.h],
  ];
  for (const [handle, cx, cy] of corners) {
    if (Math.abs(x - cx) <= size && Math.abs(y - cy) <= size) return handle;
  }
  return null;
}

/** The box after dragging `handle` to (x, y); the opposite corner stays put. */
export function resizeRect(b: Rect, handle: Handle, x: number, y: number, minSize = 6): Rect {
  const right = b.x + b.w;
  const bottom = b.y + b.h;
  let x1 = b.x;
  let y1 = b.y;
  let x2 = right;
  let y2 = bottom;
  if (handle.endsWith("w")) x1 = Math.min(x, right - minSize);
  else x2 = Math.max(x, b.x + minSize);
  if (handle.startsWith("n")) y1 = Math.min(y, bottom - minSize);
  else y2 = Math.max(y, b.y + minSize);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** The far corner of a shape being dragged: Shift makes boxes square and locks lines to 45 degrees. */
export function constrainShape(kind: ShapeKind, x1: number, y1: number, x2: number, y2: number, shift: boolean): Point {
  if (!shift) return [x2, y2];
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (kind === "line" || kind === "arrow") {
    const len = Math.hypot(dx, dy);
    if (len === 0) return [x2, y2];
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return [x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len];
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return [x1 + Math.sign(dx || 1) * size, y1 + Math.sign(dy || 1) * size];
}

export function triangleVertices(x1: number, y1: number, x2: number, y2: number): [Point, Point, Point] {
  const r = normRect(x1, y1, x2, y2);
  return [[r.x + r.w / 2, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
}

/** The two barbs of an arrow head whose tip is (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [Point, Point] {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 6;
  return [
    [x2 - size * Math.cos(a - spread), y2 - size * Math.sin(a - spread)],
    [x2 - size * Math.cos(a + spread), y2 - size * Math.sin(a + spread)],
  ];
}

function inTriangle(px: number, py: number, [a, b, c]: [Point, Point, Point]): boolean {
  const side = (p: Point, q: Point) => (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1]);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Whether (x, y) touches the object: its line within `tol`, or its inside if it is a filled shape or a picture. */
export function hitObject(o: NoteObject, x: number, y: number, tol = 6): boolean {
  if (o.type === "image") return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
  const r = o.width / 2 + tol;
  if (o.type === "stroke") {
    if (o.points.length === 1) return dist(x, y, o.points[0][0], o.points[0][1]) <= r;
    for (let i = 1; i < o.points.length; i++) {
      if (segmentDistance(x, y, o.points[i - 1][0], o.points[i - 1][1], o.points[i][0], o.points[i][1]) <= r) return true;
    }
    return false;
  }
  const b = normRect(o.x1, o.y1, o.x2, o.y2);
  switch (o.kind) {
    case "line":
    case "arrow":
      return segmentDistance(x, y, o.x1, o.y1, o.x2, o.y2) <= r;
    case "rect": {
      if (o.fill && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
      const edges: [number, number, number, number][] = [
        [b.x, b.y, b.x + b.w, b.y],
        [b.x + b.w, b.y, b.x + b.w, b.y + b.h],
        [b.x + b.w, b.y + b.h, b.x, b.y + b.h],
        [b.x, b.y + b.h, b.x, b.y],
      ];
      return edges.some(([ax, ay, bx, by]) => segmentDistance(x, y, ax, ay, bx, by) <= r);
    }
    case "ellipse": {
      const a = b.w / 2;
      const c = b.h / 2;
      if (a === 0 || c === 0) return segmentDistance(x, y, o.x1, o.y1, o.x2, o.y2) <= r;
      const k = Math.hypot((x - (b.x + a)) / a, (y - (b.y + c)) / c);
      const scale = Math.min(a, c);
      return o.fill ? k <= 1 + r / scale : Math.abs(k - 1) * scale <= r;
    }
    case "triangle": {
      const v = triangleVertices(o.x1, o.y1, o.x2, o.y2);
      if (o.fill && inTriangle(x, y, v)) return true;
      return [0, 1, 2].some((i) => segmentDistance(x, y, v[i][0], v[i][1], v[(i + 1) % 3][0], v[(i + 1) % 3][1]) <= r);
    }
  }
}

/** Index of the object under the pointer: the last drawn first, pictures only after every drawing. -1 for none. */
export function topObjectAt(objects: NoteObject[], x: number, y: number, tol = 6, skipImages = false): number {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (objects[i].type !== "image" && hitObject(objects[i], x, y, tol)) return i;
  }
  if (!skipImages) {
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].type === "image" && hitObject(objects[i], x, y, tol)) return i;
    }
  }
  return -1;
}
