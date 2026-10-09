import { useCallback, useEffect, useReducer, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { initialUpdateState, updateStatusReducer } from "./updateStatus";
import type { UpdateState } from "./updateStatus";

export interface UseUpdateStatus {
  state: UpdateState;
  checkNow: () => void;
  install: () => void;
}

/** Checks once when the window's webview loads (silently), then on demand. */
export function useUpdateStatus(): UseUpdateStatus {
  const [state, dispatch] = useReducer(updateStatusReducer, initialUpdateState);
  const found = useRef<Update | null>(null);

  const runCheck = useCallback(async (silent: boolean) => {
    dispatch({ type: "check_start" });
    try {
      const update = await check();
      found.current = update ?? null;
      dispatch({ type: "check_success", version: update?.version ?? null, nowMs: Date.now() });
    } catch (err) {
      dispatch({ type: "check_error", silent, message: String(err), nowMs: Date.now() });
    }
  }, []);

  useEffect(() => {
    runCheck(true);
    // Once, when this window's webview comes up — not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNow = useCallback(() => {
    runCheck(false);
  }, [runCheck]);

  const install = useCallback(() => {
    const update = found.current;
    if (!update) return;
    dispatch({ type: "install_start" });
    update
      .downloadAndInstall()
      .then(() => relaunch())
      .then(() => dispatch({ type: "install_done" }))
      .catch((err) => dispatch({ type: "install_error", message: String(err) }));
  }, []);

  return { state, checkNow, install };
}
