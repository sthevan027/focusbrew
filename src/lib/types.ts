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
  theme_switch_enabled: boolean;
  timer: TimerConfig;
  github_login: string | null;
}

export type TimerPhase = "off" | "focus" | "break";

export interface TimerState {
  phase: TimerPhase;
  remaining_secs: number;
}

export type TaskSource = "manual" | "github";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  created_at: string;
  source: TaskSource;
}

export interface GithubItem {
  number: number;
  title: string;
  html_url: string;
  repository: string;
  is_pull_request: boolean;
  updated_at: string;
}

export interface StateSnapshot {
  activity: Activity;
  focus_mode: boolean;
  timer: TimerState;
  tasks: Task[];
  github_items: GithubItem[];
  github_error: string | null;
  config: AppConfig;
}
