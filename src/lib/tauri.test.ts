import { beforeEach, describe, expect, it, vi } from "vitest";

const { windowListen, globalListen } = vi.hoisted(() => ({
  windowListen: vi.fn(() => Promise.resolve(() => {})),
  globalListen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({ getCurrentWebviewWindow: () => ({ listen: windowListen }) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: globalListen }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "widget" }) }));

import { onNoteFlash, onOpenNote } from "./tauri";

// Review fix C1: the backend emits to ONE window; a global listener would hear the other window's events too.
describe("note events are listened to on the current window only", () => {
  beforeEach(() => {
    windowListen.mockClear();
    globalListen.mockClear();
  });

  it("open-note", async () => {
    await onOpenNote(() => {});
    expect(windowListen).toHaveBeenCalledWith("open-note", expect.any(Function));
    expect(globalListen).not.toHaveBeenCalledWith("open-note", expect.anything());
  });

  it("note-flash", async () => {
    await onNoteFlash(() => {});
    expect(windowListen).toHaveBeenCalledWith("note-flash", expect.any(Function));
    expect(globalListen).not.toHaveBeenCalledWith("note-flash", expect.anything());
  });
});
