import type { Task } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function parse(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function key(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = parse(day);
  return key(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Local date of an epoch-ms moment. */
export function dayOfMs(ms: number): string {
  return key(new Date(ms));
}

/** "05/10". */
export function shortDate(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/** "Hoje", "Amanhã", "Ontem", or "qui 08/10". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Hoje";
  if (day === addDays(today, 1)) return "Amanhã";
  if (day === addDays(today, -1)) return "Ontem";
  return `${WEEKDAYS[parse(day).getDay()]} ${shortDate(day)}`;
}

export interface DayTasks {
  open: Task[];
  done: Task[];
}

/**
 * Today: open tasks planned up to today (left-overs roll over) and what was
 * checked off today. A future day: what is planned for it. A past day:
 * nothing open, and what was checked off on it. List order is kept.
 */
export function tasksForDay(tasks: Task[], day: string, today: string): DayTasks {
  const doneOn = (t: Task) => t.done && t.done_at !== null && dayOfMs(t.done_at) === day;
  if (day > today) {
    return {
      open: tasks.filter((t) => !t.done && t.day === day),
      done: tasks.filter((t) => t.done && t.day === day),
    };
  }
  if (day === today) {
    return { open: tasks.filter((t) => !t.done && t.day <= today), done: tasks.filter(doneOn) };
  }
  return { open: [], done: tasks.filter(doneOn) };
}

/** "02/10" for an open task left over from an earlier day; otherwise null. */
export function carriedFrom(task: Task, today: string): string | null {
  return !task.done && task.day < today ? shortDate(task.day) : null;
}

export type PanelTab = "tasks" | "summary" | "github";

/**
 * Tabs a day offers: the past only has its summary; the future its plan (and
 * GitHub items to plan); today all of them. GitHub only when connected.
 */
export function tabsFor(day: string, today: string, github: boolean): PanelTab[] {
  if (day < today) return ["summary"];
  const tabs: PanelTab[] = day > today ? ["tasks"] : ["tasks", "summary"];
  if (github) tabs.push("github");
  return tabs;
}

/** Open tasks planned per future day, for the dots on the grid. */
export function plannedByDay(tasks: Task[], today: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    if (!t.done && t.day > today) out[t.day] = (out[t.day] ?? 0) + 1;
  }
  return out;
}
