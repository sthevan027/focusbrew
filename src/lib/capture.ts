import { addDays, shortDate } from "./day";

/** Mirrors `capture::Parsed` (Rust). */
export type Parsed =
  | { kind: "task"; title: string; project: string | null; minutes: number | null; day: string | null }
  | { kind: "note"; text: string }
  | { kind: "set_minutes"; minutes: number }
  | { kind: "unknown"; text: string };

/** Mirrors `capture::commands::Target`: `ids` is a string for `one`, a list for `pick`, absent for `none`. */
export type Target = { kind: "one"; ids: string } | { kind: "pick"; ids: string[] } | { kind: "none" };

export interface CapturePreview {
  parsed: Parsed;
  target: Target;
}

/** What `capture_commit` takes. */
export type CaptureItem =
  | { kind: "task"; title: string; project: string | null; minutes: number | null; day: string | null }
  | { kind: "note"; text: string }
  | { kind: "set_minutes"; task_id: string; minutes: number };

/** One line saying what Enter will do. `today` ("AAAA-MM-DD") lets the day read "hoje" / "amanhã". */
export function describePreview(p: CapturePreview, today?: string): string {
  const { parsed } = p;
  switch (parsed.kind) {
    case "task": {
      const parts = ["Tarefa"];
      if (parsed.minutes != null) parts.push(`${parsed.minutes} min`);
      if (parsed.project) parts.push(`#${parsed.project}`);
      if (parsed.day) {
        if (today && parsed.day === today) parts.push("hoje");
        else if (today && parsed.day === addDays(today, 1)) parts.push("amanhã");
        else parts.push(shortDate(parsed.day));
      }
      return parts.join(" · ");
    }
    case "note":
      return "Nota";
    case "set_minutes":
      return `Ajustar tempo · ${parsed.minutes} min`;
    case "unknown":
      return "Não entendi";
  }
}

/** The task a "tempo N" will change, or null while there is none (or none chosen). */
function minutesTarget(target: Target, pick?: string): string | null {
  if (target.kind === "one") return target.ids;
  if (target.kind === "pick") return pick !== undefined && target.ids.includes(pick) ? pick : null;
  return null;
}

export function canCommit(p: CapturePreview, pick?: string): boolean {
  switch (p.parsed.kind) {
    case "task":
      return p.parsed.title.trim().length > 0;
    case "note":
      return p.parsed.text.trim().length > 0;
    case "set_minutes":
      return minutesTarget(p.target, pick) !== null;
    case "unknown":
      return false;
  }
}

/** The item Enter sends, or null when `canCommit` is false. */
export function toCommitItem(p: CapturePreview, pick?: string): CaptureItem | null {
  if (!canCommit(p, pick)) return null;
  const { parsed } = p;
  switch (parsed.kind) {
    case "task":
      return { kind: "task", title: parsed.title, project: parsed.project, minutes: parsed.minutes, day: parsed.day };
    case "note":
      return { kind: "note", text: parsed.text };
    case "set_minutes":
      return { kind: "set_minutes", task_id: minutesTarget(p.target, pick) as string, minutes: parsed.minutes };
    case "unknown":
      return null;
  }
}

/** Enter may commit only if the preview was computed for the text now in the box. */
export function canSubmitNow(s: {
  text: string;
  previewText: string;
  preview: CapturePreview | null;
  pick?: string;
  busy: boolean;
}): boolean {
  if (s.busy || !s.preview || !s.text.trim() || s.previewText !== s.text) return false;
  return canCommit(s.preview, s.pick);
}

/** Enter submits only from the text input; on a button it must stay a native click. */
export function isSubmitKey(e: { key: string; isComposing: boolean; targetTag: string }): boolean {
  return e.key === "Enter" && !e.isComposing && e.targetTag === "INPUT";
}
