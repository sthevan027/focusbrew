import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig, StateSnapshot } from "./types";

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

export const onStateChanged = (cb: (snapshot: StateSnapshot) => void) =>
  listen<StateSnapshot>("state-changed", (event) => cb(event.payload));
