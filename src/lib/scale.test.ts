import { describe, expect, it } from "vitest";
import { SCALE_FACTOR } from "./scale";

describe("SCALE_FACTOR", () => {
  // Must match `WidgetScale::factor` in src-tauri/src/config.rs.
  it("is 0.85 / 1 / 1.25", () => {
    expect(SCALE_FACTOR).toEqual({ small: 0.85, medium: 1, large: 1.25 });
  });
});
