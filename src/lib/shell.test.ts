import { describe, expect, it } from "vitest";
import { GROW_MS, SHRINK_MS, motionBetween, nextTickDelay, pickShape } from "./shell";
import type { PanelPhase, ShapeContext } from "./shell";
import type { TimerStatus, WidgetEdge } from "./types";

const ctx = (over: Partial<ShapeContext> = {}): ShapeContext => ({
  visible: true,
  status: "idle",
  phase: "closed",
  edge: "top",
  sideCount: "stacked",
  ...over,
});

const EDGES: WidgetEdge[] = ["top", "left", "right"];
const STATUSES: TimerStatus[] = ["idle", "running", "paused"];

// Must match IDLE_ZONE / RUNNING_ZONE / OPEN_SIZE in src-tauri/src/widget.rs.
describe("pickShape", () => {
  it("is nothing when the widget is hidden, whatever else is going on", () => {
    for (const edge of EDGES) {
      const shape = pickShape(ctx({ visible: false, status: "running", phase: "open", edge }));
      expect(shape).toEqual({
        kind: "hidden",
        shell: { width: 0, height: 0 },
        hit: { width: 0, height: 0 },
      });
    }
  });

  it("is the panel when open, whatever the timer or the edge do", () => {
    for (const edge of EDGES) {
      for (const status of STATUSES) {
        const shape = pickShape(ctx({ phase: "open", status, edge }));
        expect(shape.kind).toBe("panel");
        expect(shape.shell).toEqual({ width: 560, height: 300 });
        expect(shape.hit).toEqual({ width: 560, height: 300 });
      }
    }
  });

  it("is the wide box on the top while a block runs or is paused, whatever the side style", () => {
    for (const sideCount of ["stacked", "inline"] as const) {
      for (const status of ["running", "paused"] as const) {
        const shape = pickShape(ctx({ status, sideCount }));
        expect(shape.kind).toBe("box");
        expect(shape.shell).toEqual({ width: 320, height: 44 });
        expect(shape.hit).toEqual({ width: 320, height: 44 });
      }
    }
  });

  it("is a narrow standing bar on the side edges, with the countdown stacked", () => {
    for (const edge of ["left", "right"] as const) {
      for (const status of ["running", "paused"] as const) {
        const shape = pickShape(ctx({ status, edge, sideCount: "stacked" }));
        expect(shape.kind).toBe("box");
        expect(shape.shell).toEqual({ width: 56, height: 88 });
        expect(shape.hit).toEqual({ width: 56, height: 88 });
      }
    }
  });

  it("is a wider standing bar on the side edges, with the countdown on one line", () => {
    for (const edge of ["left", "right"] as const) {
      const shape = pickShape(ctx({ status: "running", edge, sideCount: "inline" }));
      expect(shape.kind).toBe("box");
      expect(shape.shell).toEqual({ width: 72, height: 104 });
      expect(shape.hit).toEqual({ width: 72, height: 104 });
    }
  });

  it("is the flat bar over its mouse strip when parked on the top", () => {
    const shape = pickShape(ctx());
    expect(shape.kind).toBe("bar");
    expect(shape.shell).toEqual({ width: 140, height: 6 });
    expect(shape.hit).toEqual({ width: 140, height: 14 });
  });

  it("stands the parked bar up on the side edges", () => {
    for (const edge of ["left", "right"] as const) {
      const shape = pickShape(ctx({ edge }));
      expect(shape.kind).toBe("bar");
      expect(shape.shell).toEqual({ width: 6, height: 140 });
      expect(shape.hit).toEqual({ width: 14, height: 140 });
    }
  });

  it("already shrinks back while closing, before the window does", () => {
    const closing: PanelPhase = "closing";
    expect(pickShape(ctx({ status: "running", phase: closing })).kind).toBe("box");
    expect(pickShape(ctx({ status: "running", phase: closing, edge: "left" })).shell).toEqual({ width: 56, height: 88 });
    expect(pickShape(ctx({ status: "paused", phase: closing })).shell).toEqual({ width: 320, height: 44 });
    expect(pickShape(ctx({ phase: closing })).kind).toBe("bar");
    expect(pickShape(ctx({ phase: closing })).shell).toEqual({ width: 140, height: 6 });
  });
});

describe("motionBetween", () => {
  it("grows when the shape gets bigger: bar < box < panel", () => {
    expect(motionBetween("bar", "box")).toBe("grow");
    expect(motionBetween("box", "panel")).toBe("grow");
    expect(motionBetween("bar", "panel")).toBe("grow");
    expect(motionBetween("hidden", "bar")).toBe("grow");
  });

  it("shrinks when the shape gets smaller", () => {
    expect(motionBetween("panel", "box")).toBe("shrink");
    expect(motionBetween("panel", "bar")).toBe("shrink");
    expect(motionBetween("box", "bar")).toBe("shrink");
    expect(motionBetween("bar", "hidden")).toBe("shrink");
  });

  it("is the same when the kind does not change", () => {
    for (const kind of ["hidden", "bar", "box", "panel"] as const) {
      expect(motionBetween(kind, kind)).toBe("same");
    }
  });

  it("opens slowly and closes quickly", () => {
    expect(GROW_MS).toBe(480);
    expect(SHRINK_MS).toBe(200);
    expect(SHRINK_MS).toBeLessThan(GROW_MS);
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
