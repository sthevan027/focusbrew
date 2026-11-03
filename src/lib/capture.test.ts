import { describe, expect, it } from "vitest";
import { canCommit, canSubmitNow, describePreview, isSubmitKey, toCommitItem } from "./capture";
import type { CapturePreview } from "./capture";

const task = (over: Partial<Extract<CapturePreview["parsed"], { kind: "task" }>> = {}): CapturePreview => ({
  parsed: { kind: "task", title: "revisar PR", project: "focusbrew", minutes: 40, day: "2026-11-01", ...over },
  target: { kind: "none" },
});
const minutes = (target: CapturePreview["target"]): CapturePreview => ({
  parsed: { kind: "set_minutes", minutes: 40 },
  target,
});

describe("describePreview", () => {
  it("describes a complete task", () => {
    expect(describePreview(task(), "2026-11-01")).toBe("Tarefa · 40 min · #focusbrew · hoje");
  });

  it("leaves out what was not said", () => {
    expect(describePreview(task({ project: null, minutes: null, day: null }))).toBe("Tarefa");
  });

  it("names tomorrow and shows other days as dd/mm", () => {
    expect(describePreview(task({ day: "2026-11-02" }), "2026-11-01")).toContain("amanhã");
    expect(describePreview(task({ day: "2026-11-10" }), "2026-11-01")).toContain("10/11");
  });

  it("describes a note", () => {
    expect(describePreview({ parsed: { kind: "note", text: "x" }, target: { kind: "none" } })).toBe("Nota");
  });

  it("describes a time change", () => {
    expect(describePreview(minutes({ kind: "one", ids: "a" }))).toBe("Ajustar tempo · 40 min");
  });

  it("describes what it did not understand", () => {
    expect(describePreview({ parsed: { kind: "unknown", text: "?" }, target: { kind: "none" } })).toBe("Não entendi");
  });
});

describe("canCommit", () => {
  it("is false for unknown", () => {
    expect(canCommit({ parsed: { kind: "unknown", text: "?" }, target: { kind: "none" } })).toBe(false);
  });

  it("is true for a task and a note", () => {
    expect(canCommit(task())).toBe(true);
    expect(canCommit({ parsed: { kind: "note", text: "x" }, target: { kind: "none" } })).toBe(true);
  });

  it("is false for a task with a blank title", () => {
    expect(canCommit(task({ title: "  " }))).toBe(false);
  });

  it("needs a choice when there are several candidates", () => {
    const p = minutes({ kind: "pick", ids: ["a", "b"] });
    expect(canCommit(p)).toBe(false);
    expect(canCommit(p, "b")).toBe(true);
    expect(canCommit(p, "zzz")).toBe(false);
  });

  it("is true for a single target and false for none", () => {
    expect(canCommit(minutes({ kind: "one", ids: "a" }))).toBe(true);
    expect(canCommit(minutes({ kind: "none" }))).toBe(false);
    expect(canCommit(minutes({ kind: "none" }), "a")).toBe(false);
  });
});

describe("toCommitItem", () => {
  it("builds each kind of item", () => {
    expect(toCommitItem(task())).toEqual({
      kind: "task",
      title: "revisar PR",
      project: "focusbrew",
      minutes: 40,
      day: "2026-11-01",
    });
    expect(toCommitItem({ parsed: { kind: "note", text: "oi" }, target: { kind: "none" } })).toEqual({
      kind: "note",
      text: "oi",
    });
    expect(toCommitItem(minutes({ kind: "one", ids: "a" }))).toEqual({ kind: "set_minutes", task_id: "a", minutes: 40 });
    expect(toCommitItem(minutes({ kind: "pick", ids: ["a", "b"] }), "b")).toEqual({
      kind: "set_minutes",
      task_id: "b",
      minutes: 40,
    });
  });

  it("is null when it cannot be committed", () => {
    expect(toCommitItem(minutes({ kind: "pick", ids: ["a", "b"] }))).toBeNull();
    expect(toCommitItem({ parsed: { kind: "unknown", text: "?" }, target: { kind: "none" } })).toBeNull();
  });
});

describe("canSubmitNow", () => {
  const ok = task();
  const base = { text: "abc", previewText: "abc", preview: ok, pick: undefined, busy: false };

  it("follows canCommit when the preview is for the text in the box", () => {
    expect(canSubmitNow(base)).toBe(true);
    const pickPrev = minutes({ kind: "pick", ids: ["a", "b"] });
    expect(canSubmitNow({ ...base, preview: pickPrev })).toBe(false);
    expect(canSubmitNow({ ...base, preview: pickPrev, pick: "a" })).toBe(true);
  });

  it("is false for a stale preview", () => {
    expect(canSubmitNow({ ...base, text: "abcd" })).toBe(false);
  });

  it("is false while busy, without a preview, or for blank text", () => {
    expect(canSubmitNow({ ...base, busy: true })).toBe(false);
    expect(canSubmitNow({ ...base, preview: null })).toBe(false);
    expect(canSubmitNow({ ...base, text: "  ", previewText: "  " })).toBe(false);
  });
});

describe("isSubmitKey", () => {
  it("accepts Enter on the text input", () => {
    expect(isSubmitKey({ key: "Enter", isComposing: false, targetTag: "INPUT" })).toBe(true);
  });

  it("leaves Enter on buttons to the native click", () => {
    expect(isSubmitKey({ key: "Enter", isComposing: false, targetTag: "BUTTON" })).toBe(false);
  });

  it("ignores composition and other keys", () => {
    expect(isSubmitKey({ key: "Enter", isComposing: true, targetTag: "INPUT" })).toBe(false);
    expect(isSubmitKey({ key: "a", isComposing: false, targetTag: "INPUT" })).toBe(false);
  });
});
