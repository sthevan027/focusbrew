import { describe, expect, it } from "vitest";
import { hitSize, nextTickDelay, shellSize } from "./shell";

// Must match IDLE_ZONE / RUNNING_ZONE / OPEN_SIZE in src-tauri/src/widget.rs.
describe("hitSize", () => {
  it("is the strip over the bar when parked", () => {
    expect(hitSize("idle", "closed")).toEqual({ width: 140, height: 14 });
  });

  it("is the box while a block runs or is paused", () => {
    expect(hitSize("running", "closed")).toEqual({ width: 320, height: 44 });
    expect(hitSize("paused", "closing")).toEqual({ width: 320, height: 44 });
  });

  it("is the whole panel when open", () => {
    expect(hitSize("idle", "open")).toEqual({ width: 470, height: 230 });
  });
});

describe("shellSize", () => {
  it("is the flat bar when parked and closed", () => {
    expect(shellSize("idle", "closed")).toEqual({ width: 140, height: 6 });
  });

  it("is the box while a block runs or is paused", () => {
    expect(shellSize("running", "closed")).toEqual({ width: 320, height: 44 });
    expect(shellSize("paused", "closed")).toEqual({ width: 320, height: 44 });
  });

  it("is the panel when open, whatever the timer does", () => {
    for (const status of ["idle", "running", "paused"] as const) {
      expect(shellSize(status, "open")).toEqual({ width: 470, height: 230 });
    }
  });

  it("already shrinks back while closing, before the window does", () => {
    expect(shellSize("running", "closing")).toEqual({ width: 320, height: 44 });
    expect(shellSize("idle", "closing")).toEqual({ width: 140, height: 6 });
  });
});

describe("nextTickDelay", () => {
  // The countdown shows ceil((deadline - now) / 1000): it changes exactly when
  // now lines up with the deadline's millisecond phase.
  it("waits until the next whole second before the deadline", () => {
    expect(nextTickDelay(10_000, 50_000)).toBe(1000);
    expect(nextTickDelay(10_250, 50_000)).toBe(750);
    expect(nextTickDelay(10_999, 50_000)).toBe(1);
  });

  it("follows a deadline that is not on a whole second", () => {
    expect(nextTickDelay(10_000, 50_400)).toBe(400);
    expect(nextTickDelay(10_500, 50_400)).toBe(900);
  });
});
