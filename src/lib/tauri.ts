import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppConfig, GithubItem, MonitorChoice, ProjectTotal, StateSnapshot } from "./types";

export const currentWindowLabel = () => getCurrentWindow().label;

export const getState = () => invoke<StateSnapshot>("get_state");

/**
 * Runs a command from a click without awaiting it. A failure (a task that
 * vanished between render and click, say) is logged instead of becoming an
 * unhandled rejection; the next state-changed brings the UI back in line.
 */
export function fire(call: Promise<unknown>): void {
  call.catch((err) => console.warn("focusbrew:", err));
}

export const addTask = (title: string, day: string) => invoke<StateSnapshot>("add_task", { title, day });
export const toggleTask = (id: string) => invoke<StateSnapshot>("toggle_task", { id });
export const removeTask = (id: string) => invoke<StateSnapshot>("remove_task", { id });
/** The minutes typed into the task's time field; the backend clamps to 5..=180. */
export const setTaskMinutes = (id: string, minutes: number) =>
  invoke<StateSnapshot>("set_task_minutes", { id, minutes });
export const moveTask = (id: string, day: string) => invoke<StateSnapshot>("move_task", { id, day });
/** `text` is "título #projeto"; no tag clears the project. */
export const editTask = (id: string, text: string) => invoke<StateSnapshot>("edit_task", { id, text });
export const projectTotals = () => invoke<ProjectTotal[]>("project_totals");
export const reorderTasks = (ids: string[]) => invoke<StateSnapshot>("reorder_tasks", { ids });

export const startTask = (id: string) => invoke<StateSnapshot>("start_task", { id });
export const toggleTimerPause = () => invoke<StateSnapshot>("toggle_pause");
export const stopTimer = () => invoke<StateSnapshot>("stop_timer");

export const updateSettings = (newConfig: AppConfig) =>
  invoke<StateSnapshot>("update_settings", { newConfig });

export const saveGithubToken = (token: string) => invoke<string>("save_github_token", { token });
export const githubGhAvailable = () => invoke<boolean>("github_gh_available");
export const connectGithubWithGh = () => invoke<string>("connect_github_with_gh");
export const clearGithubToken = () => invoke<void>("clear_github_token");
export const refreshGithub = () => invoke<StateSnapshot>("refresh_github");
export const importGithubItemAsTask = (item: GithubItem, day?: string) =>
  invoke<StateSnapshot>("import_github_item_as_task", {
    title: item.title,
    note: `${item.repository} #${item.number}`,
    url: item.html_url,
    repository: item.repository,
    day: day ?? null,
  });

export const setShortcut = (which: "toggle" | "panel", text: string) =>
  invoke<StateSnapshot>("set_shortcut", { which, text });
export const setLaunchAtLogin = (enabled: boolean) => invoke<StateSnapshot>("set_launch_at_login", { enabled });
export const listMonitors = () => invoke<MonitorChoice[]>("list_monitors");

/** The panel shortcut was pressed. */
export const onTogglePanel = (cb: () => void) => listen("toggle-panel", () => cb());

export const setWidgetExpanded = (expanded: boolean) =>
  invoke<void>("set_widget_expanded", { expanded });
export const openSettingsWindow = () => invoke<void>("open_settings_window");

export const onStateChanged = (cb: (snapshot: StateSnapshot) => void) =>
  listen<StateSnapshot>("state-changed", (event) => cb(event.payload));
