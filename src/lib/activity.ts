import { addDays } from "./day";

/** 3 past weeks, the current one and the next one (for planning). */
export const WEEKS = 5;
const WEEKS_BEFORE = 3;

export type Level = 0 | 1 | 2 | 3 | 4;

export interface DayCell {
  /** "AAAA-MM-DD", local date. */
  date: string;
  secs: number;
  level: Level;
  when: "past" | "today" | "future";
  /** Open tasks planned for that day. */
  planned: number;
}

/** Tone of a day by seconds of focus: 0, <15 min, <45 min, <90 min, 90+ min. */
export function level(secs: number): Level {
  if (secs <= 0) return 0;
  if (secs < 15 * 60) return 1;
  if (secs < 45 * 60) return 2;
  if (secs < 90 * 60) return 3;
  return 4;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the week that contains `day`. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const sinceMonday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(day, -sinceMonday);
}

/** 5 weeks x 7 days, row by row, Monday first; the 4th row is the current week. */
export function buildGrid(
  secsByDay: Record<string, number>,
  today: string,
  plannedByDay: Record<string, number>,
): DayCell[] {
  const first = addDays(mondayOf(today), -7 * WEEKS_BEFORE);
  const cells: DayCell[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const date = addDays(first, i);
    // ISO dates compare correctly as text
    const when = date < today ? "past" : date === today ? "today" : "future";
    const secs = when === "future" ? 0 : (secsByDay[date] ?? 0);
    cells.push({ date, secs, level: level(secs), when, planned: plannedByDay[date] ?? 0 });
  }
  return cells;
}

/** Days in a row with focus, ending today — or yesterday while today is still empty. */
export function streak(secsByDay: Record<string, number>, today: string): number {
  let day = (secsByDay[today] ?? 0) > 0 ? today : addDays(today, -1);
  let count = 0;
  while ((secsByDay[day] ?? 0) > 0) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

/** Focus from Monday of this week up to today. */
export function weekTotal(secsByDay: Record<string, number>, today: string): number {
  let total = 0;
  for (let day = mondayOf(today); day <= today; day = addDays(day, 1)) {
    total += secsByDay[day] ?? 0;
  }
  return total;
}

/** "1h 25min", "45min", "1h", "<1min" (a few seconds), "0min". */
export function formatDuration(secs: number): string {
  const totalMinutes = Math.round(secs / 60);
  if (totalMinutes === 0 && secs > 0) return "<1min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}
