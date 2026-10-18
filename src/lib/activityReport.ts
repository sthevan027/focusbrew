export type Period = "today" | "week" | "month" | "custom";

export interface CustomRange {
  from: string; // YYYY-MM-DD, local, inclusive
  to: string; // YYYY-MM-DD, local, inclusive
}

/** Half-open [from, to) range in local time for a report period. */
export function periodRange(period: Period, now: Date, custom?: CustomRange): { from: Date; to: Date } {
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  switch (period) {
    case "today":
      return { from: day(0), to: day(1) };
    case "week": {
      // Weeks start on Monday; Sunday (getDay() 0) belongs to the week that began six days earlier.
      const sinceMonday = (now.getDay() + 6) % 7;
      return { from: day(-sinceMonday), to: day(7 - sinceMonday) };
    }
    case "month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case "custom": {
      const from = parseLocalDate(custom?.from ?? "");
      const endInclusive = parseLocalDate(custom?.to ?? "");
      return { from, to: new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1) };
    }
  }
}

/** "2026-10-17" as local midnight. `new Date("2026-10-17")` would be UTC, shifting the day. */
export function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** One row of `get_activity_report`; the names match the Rust DTO. */
export interface ActivityApp {
  app_name: string;
  seconds: number;
  sessions: number;
}

export interface ActivityReportData {
  apps: ActivityApp[];
  idle_seconds: number;
}

export interface ActivityConfig {
  idle_threshold_minutes: number;
  retention_days: number;
  service_port: number;
}
