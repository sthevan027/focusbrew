import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NoteObject } from "../lib/note";
import { NOTE_ICONS } from "./noteIcons";
import { NoteSvg, strokePath } from "./NoteSvg";

const html = (objects: NoteObject[], layer?: "images" | "drawing" | "all") =>
  renderToStaticMarkup(<NoteSvg objects={objects} images={{ "0123456789abcdef.png": "data:image/png;base64,AAAA" }} layer={layer} />);

const shape = (kind: "rect" | "ellipse" | "triangle" | "line" | "arrow", fill = false): NoteObject =>
  ({ type: "shape", kind, color: "#ff0000", width: 3, fill, x1: 10, y1: 20, x2: 110, y2: 80 });

describe("strokePath", () => {
  it("writes a path through the points with one decimal", () => {
    expect(strokePath([[0, 0], [10.04, 5.06], [20, 9]])).toBe("M 0 0 L 10 5.1 L 20 9");
  });
});

describe("NoteSvg", () => {
  it("is a 560x320 sheet with the svg namespace so it can be rasterized", () => {
    const out = html([]);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('viewBox="0 0 560 320"');
  });

  it("draws a stroke as a round path and a single point as a dot", () => {
    expect(html([{ type: "stroke", color: "#fff", width: 4, points: [[0, 0], [5, 5]] }])).toContain('<path d="M 0 0 L 5 5"');
    expect(html([{ type: "stroke", color: "#fff", width: 4, points: [[3, 3]] }])).toContain("<circle");
  });

  it("draws each shape with its own element, outline by default and filled with some opacity", () => {
    expect(html([shape("rect")])).toContain("<rect");
    expect(html([shape("ellipse")])).toContain("<ellipse");
    expect(html([shape("triangle")])).toContain("<polygon");
    expect(html([shape("line")])).toContain("<line");
    const arrow = html([shape("arrow")]);
    expect(arrow).toContain("<line");
    expect(arrow).toContain("<polyline");
    expect(html([shape("rect")])).toContain('fill="none"');
    const filled = html([shape("rect", true)]);
    expect(filled).toContain('fill="#ff0000"');
    expect(filled).toContain('fill-opacity="0.25"');
  });

  it("splits pictures and drawing into layers", () => {
    const objects: NoteObject[] = [{ type: "image", file: "0123456789abcdef.png", x: 1, y: 2, w: 30, h: 40 }, shape("rect")];
    expect(html(objects, "images")).toContain("<image");
    expect(html(objects, "images")).not.toContain("<rect");
    expect(html(objects, "drawing")).toContain("<rect");
    expect(html(objects, "drawing")).not.toContain("<image");
    expect(html(objects, "all")).toContain("<image");
  });

  it("skips a picture whose file is not loaded", () => {
    expect(html([{ type: "image", file: "ffffffffffffffff.png", x: 0, y: 0, w: 5, h: 5 }])).not.toContain("<image");
  });
});

describe("NOTE_ICONS", () => {
  it("all use the 24 grid, currentColor and the same stroke style, with no hard-coded colors", () => {
    for (const [name, icon] of Object.entries(NOTE_ICONS)) {
      const out = renderToStaticMarkup(icon());
      expect(out, name).toContain('viewBox="0 0 24 24"');
      expect(out, name).toContain('stroke="currentColor"');
      expect(out, name).toContain('stroke-width="2"');
      expect(out, name).toContain('stroke-linecap="round"');
      expect(out, name).toContain('aria-hidden="true"');
      expect(out, name).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    }
  });
});
