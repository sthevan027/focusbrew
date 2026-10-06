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
  /** Monitor name; null = primary. */
  monitor: string | null;
  /** 0 = off; 1, 2 or 5. */
  notify_before_end_mins: number;
  /** 0 = off; 15, 30 or 60. */
  idle_reminder_mins: number;
  /** 0 = no goal. */
  daily_goal_mins: number;
  shortcut_toggle: string;
  shortcut_panel: string;
  launch_at_login: boolean;
}

export interface MonitorChoice {
  name: string;
  label: string;
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
  /** "AAAA-MM-DD" the task is planned for. */
  day: string;
  /** Epoch ms when it was checked off; null while open. */
  done_at: number | null;
  project: string | null;
  /** The PR/issue it came from. */
  url: string | null;
}

/** One block of work that ended (title/project as they were then). */
export interface Session {
  task_id: string;
  title: string;
  project: string | null;
  /** Local date the block ended on. */
  day: string;
  ended_ms: number;
  secs: number;
}

export interface GithubItem {
  number: number;
  title: string;
  html_url: string;
  repository: string;
  is_pull_request: boolean;
  updated_at: string;
}

/** Seconds per project (`null` = no project) over a few spans. */
export interface ProjectTotal {
  project: string | null;
  today: number;
  /** Today and the 6 days before. */
  week: number;
  /** Today and the 29 days before. */
  month: number;
  total: number;
}

/** Something done on GitHub, on a local day. */
export interface GithubEvent {
  day: string;
  /** "push", "pr_opened", "pr_merged", "pr_closed", "pr_reopened",
   *  "issue_opened", "issue_closed", "issue_reopened" or "review". */
  kind: string;
  repo: string;
  number: number | null;
  title: string | null;
  count: number;
  at: string;
}

export type GithubTokenSource = "gh" | "manual";

export interface StateSnapshot {
  tasks: Task[];
  timer: TimerView;
  /** "AAAA-MM-DD" -> seconds of focus that ended on that day. */
  focus_secs_by_day: Record<string, number>;
  /** Blocks of the last 42 days. */
  sessions: Session[];
  /** The backend's local date, "AAAA-MM-DD". */
  today: string;
  config: AppConfig;
  github_items: GithubItem[];
  github_error: string | null;
  github_days: Record<string, number>;
  github_events: GithubEvent[];
  github_source: GithubTokenSource | null;
  /** A configured shortcut another app holds (so it is not active). */
  shortcut_warning: string | null;
}
