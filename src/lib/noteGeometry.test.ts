import { describe, expect, it } from "vitest";
import type { NoteObject, Point } from "./note";
import {
  arrowHead, constrainShape, fitObject, hitHandle, hitObject, normRect, objectBounds, resizeRect,
  segmentDistance, simplifyPoints, topObjectAt, translateObject, triangleVertices,
} from "./noteGeometry";

const stroke = (points: Point[], width = 4): NoteObject => ({ type: "stroke", color: "#fff", width, points });
const shape = (kind: "rect" | "ellipse" | "triangle" | "line" | "arrow", x1: number, y1: number, x2: number, y2: number, fill = false): NoteObject =>
  ({ type: "shape", kind, color: "#fff", width: 2, fill, x1, y1, x2, y2 });
const image = (x: number, y: number, w: number, h: number): NoteObject => ({ type: "image", file: "0123456789abcdef.png", x, y, w, h });

describe("segmentDistance and simplifyPoints", () => {
  it("measures the distance to a segment, including past its ends", () => {
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(segmentDistance(-4, 3, 0, 0, 10, 0)).toBe(5);
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it("drops points closer than the minimum to the last kept one but keeps the first and last", () => {
    const pts: Point[] = [[0, 0], [0.5, 0], [1, 0], [3, 0], [3.2, 0], [3.4, 0]];
    expect(simplifyPoints(pts, 1.5)).toEqual([[0, 0], [3, 0], [3.4, 0]]);
    expect(simplifyPoints([[1, 1]], 1.5)).toEqual([[1, 1]]);
    expect(simplifyPoints([[1, 1], [1, 1]], 1.5)).toEqual([[1, 1], [1, 1]]);
  });
});

describe("bounds, move and resize", () => {
  it("gives the bounds of every kind of object", () => {
    expect(objectBounds(stroke([[10, 20], [30, 5]]))).toEqual({ x: 10, y: 5, w: 20, h: 15 });
    expect(objectBounds(shape("rect", 50, 40, 10, 20))).toEqual({ x: 10, y: 20, w: 40, h: 20 });
    expect(objectBounds(image(1, 2, 3, 4))).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(normRect(5, 5, 1, 9)).toEqual({ x: 1, y: 5, w: 4, h: 4 });
  });

  it("moves any object without touching its size", () => {
    expect(translateObject(shape("line", 0, 0, 10, 5), 3, -2)).toEqual(shape("line", 3, -2, 13, 3));
    expect(translateObject(image(1, 1, 5, 5), 2, 2)).toEqual(image(3, 3, 5, 5));
    expect(translateObject(stroke([[0, 0], [1, 1]]), 5, 5)).toEqual(stroke([[5, 5], [6, 6]]));
  });

  it("scales an object from one box to another", () => {
    const from = { x: 0, y: 0, w: 10, h: 10 };
    const to = { x: 10, y: 10, w: 20, h: 40 };
    expect(fitObject(image(0, 0, 10, 10), from, to)).toEqual(image(10, 10, 20, 40));
    expect(fitObject(shape("rect", 0, 0, 10, 10), from, to)).toEqual(shape("rect", 10, 10, 30, 50));
    expect(fitObject(stroke([[5, 5]]), from, to)).toEqual(stroke([[20, 30]]));
  });

  it("does not divide by zero for a flat box", () => {
    const flat = { x: 0, y: 5, w: 10, h: 0 };
    const moved = fitObject(shape("line", 0, 5, 10, 5), flat, { x: 0, y: 5, w: 20, h: 0 });
    expect(JSON.stringify(moved)).not.toContain("null");
  });

  it("finds the corner handle under the pointer and resizes from the opposite corner", () => {
    const b = { x: 10, y: 10, w: 40, h: 30 };
    expect(hitHandle(b, 11, 9)).toBe("nw");
    expect(hitHandle(b, 50, 40)).toBe("se");
    expect(hitHandle(b, 30, 25)).toBeNull();
    expect(resizeRect(b, "se", 90, 70)).toEqual({ x: 10, y: 10, w: 80, h: 60 });
    expect(resizeRect(b, "nw", 0, 0)).toEqual({ x: 0, y: 0, w: 50, h: 40 });
    expect(resizeRect(b, "se", 0, 0)).toEqual({ x: 10, y: 10, w: 6, h: 6 }); // never smaller than the minimum
  });
});

describe("shapes: Shift and the arrow head", () => {
  it("makes rectangles and ellipses proportional with Shift, in any direction", () => {
    expect(constrainShape("rect", 10, 10, 50, 30, true)).toEqual([50, 50]);
    expect(constrainShape("ellipse", 50, 50, 10, 40, true)).toEqual([10, 10]);
    expect(constrainShape("rect", 10, 10, 50, 30, false)).toEqual([50, 30]);
  });

  it("locks lines and arrows to 45 degree steps with Shift", () => {
    const [x, y] = constrainShape("line", 0, 0, 10, 3, true);
    expect(x).toBeCloseTo(Math.hypot(10, 3), 5);
    expect(y).toBeCloseTo(0, 5);
    const [dx, dy] = constrainShape("arrow", 0, 0, 7, 8, true);
    expect(dx).toBeCloseTo(dy, 5);
    expect(constrainShape("arrow", 5, 5, 5, 5, true)).toEqual([5, 5]);
  });

  it("puts the triangle apex at the top middle of its box", () => {
    expect(triangleVertices(0, 0, 10, 20)).toEqual([[5, 0], [10, 20], [0, 20]]);
    expect(triangleVertices(10, 20, 0, 0)).toEqual([[5, 0], [10, 20], [0, 20]]);
  });

  it("draws the two barbs of the arrow head behind its tip", () => {
    const [a, b] = arrowHead(0, 0, 10, 0, 4);
    expect(a[0]).toBeCloseTo(10 - 4 * Math.cos(Math.PI / 6), 5);
    expect(Math.abs(a[1])).toBeCloseTo(2, 5);
    expect(a[1]).toBeCloseTo(-b[1], 5);
  });
});

describe("hit testing", () => {
  it("hits a stroke near its line and not far from it", () => {
    const s = stroke([[0, 0], [100, 0]], 4);
    expect(hitObject(s, 50, 5)).toBe(true);
    expect(hitObject(s, 50, 20)).toBe(false);
    expect(hitObject(stroke([[10, 10]]), 12, 12)).toBe(true);
  });

  it("hits the outline of an unfilled rectangle and the inside only when it is filled", () => {
    const empty = shape("rect", 0, 0, 100, 100);
    expect(hitObject(empty, 0, 50)).toBe(true);
    expect(hitObject(empty, 50, 50)).toBe(false);
    expect(hitObject(shape("rect", 0, 0, 100, 100, true), 50, 50)).toBe(true);
  });

  it("hits ellipses, triangles, lines and images", () => {
    expect(hitObject(shape("ellipse", 0, 0, 100, 60), 50, 0)).toBe(true);
    expect(hitObject(shape("ellipse", 0, 0, 100, 60), 50, 30)).toBe(false);
    expect(hitObject(shape("ellipse", 0, 0, 100, 60, true), 50, 30)).toBe(true);
    expect(hitObject(shape("triangle", 0, 0, 100, 100, true), 50, 60)).toBe(true);
    expect(hitObject(shape("triangle", 0, 0, 100, 100, true), 5, 5)).toBe(false);
    expect(hitObject(shape("line", 0, 0, 100, 100), 50, 52)).toBe(true);
    expect(hitObject(shape("arrow", 0, 0, 100, 0), 50, 40)).toBe(false);
    expect(hitObject(image(10, 10, 50, 50), 30, 30)).toBe(true);
    expect(hitObject(image(10, 10, 50, 50), 70, 30)).toBe(false);
  });

  it("picks the top object first and prefers drawing over a picture under it", () => {
    const objects = [image(0, 0, 200, 200), shape("rect", 20, 20, 60, 60, true), shape("rect", 30, 30, 70, 70, true)];
    expect(topObjectAt(objects, 40, 40)).toBe(2);
    expect(topObjectAt(objects, 25, 25)).toBe(1);
    expect(topObjectAt(objects, 150, 150)).toBe(0);
    expect(topObjectAt(objects, 150, 150, 6, true)).toBe(-1);
    expect(topObjectAt(objects, 500, 500)).toBe(-1);
  });
});
