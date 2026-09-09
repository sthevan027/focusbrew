import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppConfig, StateSnapshot } from "./types";

export const currentWindowLabel = () => getCurrentWindow().label;

export const getState = () => invoke<StateSnapshot>("get_state");

export const addTask = (title: string) => invoke<StateSnapshot>("add_task", { title });
export const toggleTask = (id: string) => invoke<StateSnapshot>("toggle_task", { id });
export const removeTask = (id: string) => invoke<StateSnapshot>("remove_task", { id });

export const updateSettings = (newConfig: AppConfig) =>
  invoke<StateSnapshot>("update_settings", { newConfig });

export const saveGithubToken = (token: string) => invoke<string>("save_github_token", { token });
export const clearGithubToken = () => invoke<void>("clear_github_token");
export const refreshGithub = () => invoke<StateSnapshot>("refresh_github");
export const importGithubItemAsTask = (title: string) =>
  invoke<StateSnapshot>("import_github_item_as_task", { title });

export const startCoffeeBreak = () => invoke<StateSnapshot>("start_coffee_break");
export const stopTimer = () => invoke<StateSnapshot>("stop_timer");
export const togglePauseTimer = () => invoke<StateSnapshot>("toggle_pause_timer");

export const setWidgetExpanded = (expanded: boolean) =>
  invoke<void>("set_widget_expanded", { expanded });
export const toggleWidgetVisibility = () => invoke<void>("toggle_widget_visibility");
export const openMainWindow = () => invoke<void>("open_main_window");
export const toggleFocusSession = () => invoke<void>("toggle_focus_session");
export const getAccentColor = () => invoke<string | null>("get_accent_color");

export const onStateChanged = (cb: (snapshot: StateSnapshot) => void) =>
  listen<StateSnapshot>("state-changed", (event) => cb(event.payload));
