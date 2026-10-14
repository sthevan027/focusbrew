import { describe, expect, it } from "vitest";
import { defaultTab, nextTab } from "./mediaTabs";

describe("defaultTab", () => {
  it("is task whenever a task is active, even with media also playing", () => {
    expect(defaultTab(true, true)).toBe("task");
    expect(defaultTab(true, false)).toBe("task");
  });

  it("is media when there is no active task", () => {
    expect(defaultTab(false, true)).toBe("media");
  });

  it("falls back to task when neither source is active (nothing renders either way)", () => {
    expect(defaultTab(false, false)).toBe("task");
  });
});

describe("nextTab", () => {
  it("switches to the other tab when both sources are active", () => {
    expect(nextTab("task", true, true, 1)).toBe("media");
    expect(nextTab("media", true, true, -1)).toBe("task");
  });

  it("does nothing when only one source is active", () => {
    expect(nextTab("task", true, false, 1)).toBe("task");
    expect(nextTab("media", false, true, -1)).toBe("media");
  });

  it("does nothing when neither source is active", () => {
    expect(nextTab("task", false, false, 1)).toBe("task");
  });

  it("is deterministic regardless of the scroll direction's magnitude", () => {
    expect(nextTab("task", true, true, 120)).toBe("media");
    expect(nextTab("task", true, true, -120)).toBe("media");
  });
});
