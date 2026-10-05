import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS, normalizeHex } from "./colors";

describe("normalizeHex", () => {
  it("accepts #rrggbb in any case and writes it in upper case", () => {
    expect(normalizeHex("#ff9f0a")).toBe("#FF9F0A");
    expect(normalizeHex("#0A84FF")).toBe("#0A84FF");
    expect(normalizeHex("  #00ff7f  ")).toBe("#00FF7F");
  });

  it("refuses everything else", () => {
    for (const bad of ["red", "#12345", "#1234567", "#GGGGGG", "", "0A84FF", "#0A84F", "#"]) {
      expect(normalizeHex(bad), bad).toBeNull();
    }
  });
});

describe("ACCENT_PRESETS", () => {
  it("has six valid, distinct colors starting with the default blue", () => {
    expect(ACCENT_PRESETS).toHaveLength(6);
    expect(ACCENT_PRESETS[0].hex).toBe("#0A84FF");
    expect(new Set(ACCENT_PRESETS.map((p) => p.hex)).size).toBe(6);
    for (const preset of ACCENT_PRESETS) expect(normalizeHex(preset.hex)).toBe(preset.hex);
  });
});
