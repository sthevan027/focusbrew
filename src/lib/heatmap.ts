export interface HeatmapDay {
  date: string;
  count: number;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// `new Date("YYYY-MM-DD")` parses as UTC midnight, which can roll back a day
// in local time at negative UTC offsets (e.g. Brazil) — parse the parts
// directly instead so month/day boundaries land correctly.
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Last `weeks * 7` days (oldest first), ending today. Rendered as a
// GitHub-style grid with 7 rows (columns = weeks).
export function buildHeatmap(focusDays: Record<string, number>, weeks = 9): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  const today = new Date();
  const total = weeks * 7;
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toDateKey(d);
    days.push({ date: key, count: focusDays[key] ?? 0 });
  }
  return days;
}

export function intensityClass(count: number): string {
  if (count <= 0) return "lvl-0";
  if (count === 1) return "lvl-1";
  if (count === 2) return "lvl-2";
  if (count <= 4) return "lvl-3";
  return "lvl-4";
}

// Consecutive days (ending today or yesterday) with at least one
// contribution. Today not having one yet doesn't break the streak.
export function computeStreak(days: Record<string, number>): number {
  const cursor = new Date();
  if (!days[toDateKey(cursor)]) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while ((days[toDateKey(cursor)] ?? 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Full calendar grid (GitHub-style): `weeks` columns of 7 days (Sun..Sat),
// ending on the Saturday that closes the current week.
export function buildHeatmapWeeks(dayCounts: Record<string, number>, weeks = 18): HeatmapDay[][] {
  const today = new Date();
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
  const start = new Date(endOfWeek);
  start.setDate(endOfWeek.getDate() - weeks * 7 + 1);

  const cols: HeatmapDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      const key = toDateKey(day);
      col.push({ date: key, count: dayCounts[key] ?? 0 });
    }
    cols.push(col);
  }
  return cols;
}

// One label per column — the month name where it first appears in the
// grid, null otherwise (so it only prints once per month, like GitHub's).
export function monthLabelsForWeeks(cols: HeatmapDay[][]): (string | null)[] {
  let lastMonth = -1;
  return cols.map((col) => {
    const m = parseDateKey(col[0].date).getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      return MONTH_NAMES[m];
    }
    return null;
  });
}
