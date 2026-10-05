export type Activity = "idle" | "working";

export interface TimerConfig {
  focus_minutes: number;
  break_minutes: number;
  auto_start: boolean;
}

export interface AppConfig {
  monitored_processes: string[];
  blocked_apps: string[];
  poll_interval_secs: number;
  focus_auto_enable: boolean;
  block_apps_enabled: boolean;
  dnd_enabled: boolean;
  timer: TimerConfig;
  github_login: string | null;
  ring_color: string | null;
  github_use_gh: boolean;
}

export type TimerPhase = "off" | "focus" | "break";

export interface TimerState {
  phase: TimerPhase;
  remaining_secs: number;
  paused: boolean;
}

export type TaskSource = "manual" | "github";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  created_at: string;
  source: TaskSource;
}

export type SessionKind = "focus" | "break";

export interface SessionRecord {
  kind: SessionKind;
  started_at: string;
  ended_at: string;
  duration_secs: number;
}

export interface GithubItem {
  number: number;
  title: string;
  html_url: string;
  repository: string;
  is_pull_request: boolean;
  updated_at: string;
}

export type GithubTokenSource = "gh" | "manual";

export interface StateSnapshot {
  activity: Activity;
  focus_mode: boolean;
  timer: TimerState;
  tasks: Task[];
  github_items: GithubItem[];
  github_error: string | null;
  config: AppConfig;
  focus_days: Record<string, number>;
  streak: number;
  github_days: Record<string, number>;
  github_source: GithubTokenSource | null;
  sessions: SessionRecord[];
  app_seconds_today: Record<string, number>;
  uptime_secs: number;
}
