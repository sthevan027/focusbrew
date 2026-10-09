import { describe, expect, it } from "vitest";
import type { Note, NoteObject } from "./note";
import { canAddObject, canAddPoint, filterNotes, fitInto, formatNoteDate, newNote, noteTitle, noteWasDeleted, scaleToMax, wrapText } from "./noteMeta";

const base = (over: Partial<Note>): Note => ({ id: "a", created_ms: 0, updated_ms: new Date(2026, 9, 8, 14, 5).getTime(), text: "", objects: [], ...over });

describe("noteTitle", () => {
  it("is the first non-empty line, trimmed and cut at 60 characters", () => {
    expect(noteTitle(base({ text: "\n  \n  Fluxo do login  \nresto" }))).toBe("Fluxo do login");
    expect(noteTitle(base({ text: "x".repeat(80) }))).toBe(`${"x".repeat(57)}…`);
  });

  it("falls back to Desenho + date for a note with only drawing, and to Nota vazia", () => {
    const obj: NoteObject = { type: "stroke", color: "#fff", width: 2, points: [[0, 0]] };
    expect(noteTitle(base({ objects: [obj] }))).toBe("Desenho · 08/10 14:05");
    expect(noteTitle(base({}))).toBe("Nota vazia");
  });
});

describe("formatNoteDate and newNote", () => {
  it("writes dd/MM HH:mm with zeros", () => {
    expect(formatNoteDate(new Date(2026, 0, 3, 7, 9).getTime())).toBe("03/01 07:09");
  });

  it("starts a note empty with the given id and dates", () => {
    expect(newNote(123, "abc")).toEqual({ id: "abc", created_ms: 123, updated_ms: 123, text: "", objects: [] });
  });
});

describe("filterNotes", () => {
  const notes = [base({ id: "1", text: "Reunião com o cliente" }), base({ id: "2", text: "lista de compras" })];

  it("matches ignoring case and accents, and returns everything for an empty query", () => {
    expect(filterNotes(notes, "reuniao").map((n) => n.id)).toEqual(["1"]);
    expect(filterNotes(notes, "COMPRAS").map((n) => n.id)).toEqual(["2"]);
    expect(filterNotes(notes, "  ")).toHaveLength(2);
    expect(filterNotes(notes, "xyz")).toHaveLength(0);
  });
});

describe("image and text measures", () => {
  it("scales an image down to at most `max` on its longest side and never up", () => {
    expect(scaleToMax(3200, 1600, 1600)).toEqual({ w: 1600, h: 800 });
    expect(scaleToMax(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  });

  it("fits an image into a box keeping its proportion, never enlarging it", () => {
    expect(fitInto(600, 300, 300, 220)).toEqual({ w: 300, h: 150 });
    expect(fitInto(100, 50, 300, 220)).toEqual({ w: 100, h: 50 });
  });

  it("wraps text by measured width and keeps blank lines", () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText("aaa bbb ccc", 70, measure)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("a\n\nb", 100, measure)).toEqual(["a", "", "b"]);
    expect(wrapText("supercalifragilistic", 50, measure)).toEqual(["supercalifragilistic"]);
  });
});

describe("noteWasDeleted (review fix I4)", () => {
  const ids = [{ id: "x" }, { id: "y" }];

  it("is true when a note we had saved, untouched since, is gone while it still has content", () => {
    expect(noteWasDeleted({ saved: true, dirty: false, empty: false, list: ids, id: "z" })).toBe(true);
  });

  it("is false while the note is in the list, never saved, has pending edits or was just emptied by the user", () => {
    expect(noteWasDeleted({ saved: true, dirty: false, empty: false, list: ids, id: "x" })).toBe(false);
    expect(noteWasDeleted({ saved: false, dirty: false, empty: false, list: ids, id: "z" })).toBe(false);
    expect(noteWasDeleted({ saved: true, dirty: true, empty: false, list: ids, id: "z" })).toBe(false);
    expect(noteWasDeleted({ saved: true, dirty: false, empty: true, list: ids, id: "z" })).toBe(false);
  });
});

describe("object limits (review fix I2)", () => {
  it("stops adding objects and stroke points at the backend limits", () => {
    expect(canAddObject(2999)).toBe(true);
    expect(canAddObject(3000)).toBe(false);
    expect(canAddPoint(1999)).toBe(true);
    expect(canAddPoint(2000)).toBe(false);
  });
});
