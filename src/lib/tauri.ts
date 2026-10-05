import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppConfig, StateSnapshot } from "./types";

export const currentWindowLabel = () => getCurrentWindow().label;

export const getState = () => invoke<StateSnapshot>("get_state");

export const addTask = (title: string) => invoke<StateSnapshot>("add_task", { title });
export const toggleTask = (id: string) => invoke<StateSnapshot>("toggle_task", { id });
export const removeTask = (id: string) => invoke<StateSnapshot>("remove_task", { id });
export const updateTaskMinutes = (id: string, minutes: number) =>
  invoke<StateSnapshot>("update_task_minutes", { id, minutes });
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
export const importGithubItemAsTask = (title: string, note: string) =>
  invoke<StateSnapshot>("import_github_item_as_task", { title, note });

export const setWidgetExpanded = (expanded: boolean) =>
  invoke<void>("set_widget_expanded", { expanded });
export const openSettingsWindow = () => invoke<void>("open_settings_window");

export const onStateChanged = (cb: (snapshot: StateSnapshot) => void) =>
  listen<StateSnapshot>("state-changed", (event) => cb(event.payload));
