import type { Session, Task } from "./types";
import { dayOfMs } from "./day";

export interface SummaryRow {
  taskId: string;
  title: string;
  project: string | null;
  secs: number;
  /** Checked off on that day. */
  done: boolean;
}

export interface DaySummary {
  totalSecs: number;
  doneCount: number;
  /** Most time first; tasks checked off without time that day come last. */
  rows: SummaryRow[];
  /** Most time first; `null` (no project) last. */
  byProject: { project: string | null; secs: number }[];
}

export function daySummary(sessions: Session[], tasks: Task[], day: string): DaySummary {
  const rows = new Map<string, SummaryRow>();
  const projects = new Map<string | null, number>();
  let totalSecs = 0;

  for (const s of sessions) {
    if (s.day !== day) continue;
    totalSecs += s.secs;
    projects.set(s.project, (projects.get(s.project) ?? 0) + s.secs);
    const row = rows.get(s.task_id);
    if (row) {
      row.secs += s.secs;
      // the latest block's title/project win
      row.title = s.title;
      row.project = s.project;
    } else {
      rows.set(s.task_id, { taskId: s.task_id, title: s.title, project: s.project, secs: s.secs, done: false });
    }
  }

  const doneThatDay = tasks.filter((t) => t.done && t.done_at !== null && dayOfMs(t.done_at) === day);
  for (const t of doneThatDay) {
    const row = rows.get(t.id);
    if (row) row.done = true;
    else rows.set(t.id, { taskId: t.id, title: t.title, project: t.project, secs: 0, done: true });
  }

  const byProject = [...projects.entries()]
    .map(([project, secs]) => ({ project, secs }))
    .sort((a, b) => (a.project === null ? 1 : 0) - (b.project === null ? 1 : 0) || b.secs - a.secs);

  return {
    totalSecs,
    doneCount: doneThatDay.length,
    rows: [...rows.values()].sort((a, b) => b.secs - a.secs),
    byProject,
  };
}
