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
