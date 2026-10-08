import { beforeEach, describe, expect, it, vi } from "vitest";

const { readNoteImage } = vi.hoisted(() => ({ readNoteImage: vi.fn() }));
vi.mock("../lib/tauri", () => ({ readNoteImage }));

import { cacheImage, loadImages, resetImageCache } from "./imageCache";

// Review fix I3: every autosave re-read every image of every note over IPC.
describe("imageCache", () => {
  beforeEach(() => {
    resetImageCache();
    readNoteImage.mockReset();
    readNoteImage.mockImplementation((file: string) => Promise.resolve(`data:image/png;base64,${file}`));
  });

  it("reads each file once, however many times it is asked for", async () => {
    await loadImages(["a.png", "b.png"]);
    const again = await loadImages(["a.png", "b.png", "c.png"]);
    expect(readNoteImage).toHaveBeenCalledTimes(3);
    expect(Object.keys(again).sort()).toEqual(["a.png", "b.png", "c.png"]);
  });

  it("shares a read that is already in flight", async () => {
    await Promise.all([loadImages(["a.png"]), loadImages(["a.png"])]);
    expect(readNoteImage).toHaveBeenCalledTimes(1);
  });

  it("skips a file that cannot be read, and tries it again next time", async () => {
    readNoteImage.mockRejectedValueOnce(new Error("missing"));
    expect(await loadImages(["a.png"])).toEqual({});
    expect(Object.keys(await loadImages(["a.png"]))).toEqual(["a.png"]);
  });

  it("uses a picture that was just stored without reading it back", async () => {
    cacheImage("n.png", "data:image/png;base64,NEW");
    expect(await loadImages(["n.png"])).toEqual({ "n.png": "data:image/png;base64,NEW" });
    expect(readNoteImage).not.toHaveBeenCalled();
  });
});
