export type NotchStyle = "standard" | "minimal";
export type WidgetScale = "small" | "medium" | "large";

export interface AppConfig {
  github_login: string | null;
  github_use_gh: boolean;
  default_minutes: number;
  notify_on_finish: boolean;
  notch_style: NotchStyle;
  progress_line: boolean;
  rgb_line: boolean;
  accent_color: string;
  widget_scale: WidgetScale;
  widget_visible: boolean;
}

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerView {
  status: TimerStatus;
  task_id: string | null;
  planned_secs: number;
  remaining_secs: number;
  /** Epoch ms when a running block ends; 0 unless running. */
  deadline_ms: number;
}

export type TaskSource = "manual" | "github";

export interface Task {
  id: string;
  title: string;
  note: string | null;
  minutes: number;
  done: boolean;
  created_at: string;
  source: TaskSource;
  spent_secs: number;
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
  tasks: Task[];
  timer: TimerView;
  /** "AAAA-MM-DD" -> seconds of focus that ended on that day. */
  focus_secs_by_day: Record<string, number>;
  config: AppConfig;
  github_items: GithubItem[];
  github_error: string | null;
  github_days: Record<string, number>;
  github_source: GithubTokenSource | null;
}
