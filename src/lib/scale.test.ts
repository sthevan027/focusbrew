import { describe, expect, it } from "vitest";
import { scaleFactor } from "./scale";

describe("scaleFactor", () => {
  // Must match `AppConfig::scale_factor` in src-tauri/src/config.rs.
  it("is medium for the standard notch and small for the minimal one", () => {
    expect(scaleFactor("standard")).toBe(1);
    expect(scaleFactor("minimal")).toBe(0.85);
  });

  it("is medium for the media-only box, whatever the style", () => {
    expect(scaleFactor("minimal", true)).toBe(1);
    expect(scaleFactor("standard", true)).toBe(1);
  });
});
