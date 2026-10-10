import { describe, expect, it } from "vitest";
import {
  CHECK_ERROR_TEXT,
  INSTALL_ERROR_TEXT,
  formatCheckedAt,
  initialUpdateState,
  statusHint,
  updateStatusReducer,
} from "./updateStatus";

describe("updateStatusReducer", () => {
  it("marks checking and clears a previous error on check_start", () => {
    const state = updateStatusReducer({ ...initialUpdateState, error: "old" }, { type: "check_start" });
    expect(state.checking).toBe(true);
    expect(state.error).toBeNull();
  });

  it("records the timestamp and version on a successful check", () => {
    const state = updateStatusReducer(initialUpdateState, {
      type: "check_success",
      version: "0.5.0",
      nowMs: 1000,
    });
    expect(state).toMatchObject({ checking: false, lastCheckedMs: 1000, availableVersion: "0.5.0", error: null });
  });

  it("a successful check with no update clears a previously-seen version", () => {
    const stale = { ...initialUpdateState, availableVersion: "0.4.0" };
    const state = updateStatusReducer(stale, { type: "check_success", version: null, nowMs: 2000 });
    expect(state.availableVersion).toBeNull();
  });

  it("a silent check failure stops checking but changes nothing else", () => {
    const before = { ...initialUpdateState, lastCheckedMs: 500, availableVersion: "0.5.0" };
    const state = updateStatusReducer(before, {
      type: "check_error",
      silent: true,
      nowMs: 9999,
    });
    expect(state).toEqual({ ...before, checking: false });
  });

  it("a manual check failure records the timestamp and a friendly message, not the raw error", () => {
    const state = updateStatusReducer(initialUpdateState, {
      type: "check_error",
      silent: false,
      nowMs: 3000,
    });
    expect(state).toMatchObject({ checking: false, lastCheckedMs: 3000, error: CHECK_ERROR_TEXT });
    expect(CHECK_ERROR_TEXT).not.toMatch(/json|http|remote/i);
  });

  it("install_start clears a previous error", () => {
    const state = updateStatusReducer({ ...initialUpdateState, error: "old" }, { type: "install_start" });
    expect(state).toMatchObject({ installing: true, error: null });
  });

  it("install_error stops installing and records a friendly message", () => {
    const state = updateStatusReducer({ ...initialUpdateState, installing: true }, { type: "install_error" });
    expect(state).toMatchObject({ installing: false, error: INSTALL_ERROR_TEXT });
  });

  it("install_done just stops installing", () => {
    const state = updateStatusReducer({ ...initialUpdateState, installing: true }, { type: "install_done" });
    expect(state.installing).toBe(false);
  });
});

describe("formatCheckedAt", () => {
  it("writes local HH:MM, zero-padded", () => {
    const d = new Date(2026, 9, 9, 9, 5);
    expect(formatCheckedAt(d.getTime())).toBe("09:05");
  });
});

describe("statusHint", () => {
  it("is undefined before any check finished", () => {
    expect(statusHint(initialUpdateState)).toBeUndefined();
  });

  it("says up to date when there is no available version", () => {
    const state = { ...initialUpdateState, lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime() };
    expect(statusHint(state)).toBe("Você está na versão mais recente. Verificado às 17:09.");
  });

  it("shows the failure text instead of the status line when there is one", () => {
    const state = {
      ...initialUpdateState,
      lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime(),
      error: CHECK_ERROR_TEXT,
    };
    expect(statusHint(state)).toBe(CHECK_ERROR_TEXT);
  });

  it("names the available version", () => {
    const state = {
      ...initialUpdateState,
      lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime(),
      availableVersion: "0.5.0",
    };
    expect(statusHint(state)).toBe("Versão 0.5.0 disponível. Verificado às 17:09.");
  });
});
