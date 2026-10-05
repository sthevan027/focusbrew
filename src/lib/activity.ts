export const WEEKS = 4;

export type Level = 0 | 1 | 2 | 3 | 4;

export interface DayCell {
  /** "AAAA-MM-DD", local date. */
  date: string;
  secs: number;
  level: Level;
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

/** Monday of the week that contains `d` (local time, at midnight). */
export function mondayOf(d: Date): Date {
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
}

/**
 * 4 weeks x 7 days, row by row (Monday first); the last row is the current
 * week. Days after `today` are `null` (nothing is drawn for the future).
 */
export function buildGrid(secsByDay: Record<string, number>, today: Date): (DayCell | null)[] {
  const first = mondayOf(today);
  first.setDate(first.getDate() - 7 * (WEEKS - 1));
  const todayKey = dateKey(today);
  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const key = dateKey(day);
    if (key > todayKey) {
      cells.push(null); // ISO dates compare correctly as text
      continue;
    }
    const secs = secsByDay[key] ?? 0;
    cells.push({ date: key, secs, level: level(secs) });
  }
  return cells;
}

/** "1h 25min", "45min", "1h", "0min". */
export function formatDuration(secs: number): string {
  const totalMinutes = Math.round(secs / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

/** Tooltip of a square: "05/10 — 1h 25min". */
export function cellTitle(cell: DayCell): string {
  const [, month, day] = cell.date.split("-");
  return `${day}/${month} — ${formatDuration(cell.secs)}`;
}
