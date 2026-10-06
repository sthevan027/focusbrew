import { describe, expect, it } from "vitest";
import { comboFromKeys, prettyShortcut } from "./shortcut";

const keys = (code: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }> = {}) => ({
  code,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
  metaKey: mods.meta ?? false,
});

describe("comboFromKeys", () => {
  it("writes the combination the backend parses", () => {
    expect(comboFromKeys(keys("Space", { ctrl: true, shift: true }))).toBe("CommandOrControl+Shift+Space");
    expect(comboFromKeys(keys("KeyK", { ctrl: true, alt: true }))).toBe("CommandOrControl+Alt+KeyK");
    expect(comboFromKeys(keys("Digit1", { alt: true }))).toBe("Alt+Digit1");
  });

  it("waits while only modifiers are down", () => {
    expect(comboFromKeys(keys("ControlLeft", { ctrl: true }))).toBe(null);
    expect(comboFromKeys(keys("ShiftRight", { shift: true }))).toBe(null);
  });

  it("refuses a plain key, which would steal normal typing", () => {
    expect(comboFromKeys(keys("KeyK"))).toBe(null);
    expect(comboFromKeys(keys("KeyK", { shift: true }))).toBe(null);
  });

  it("accepts function keys alone", () => {
    expect(comboFromKeys(keys("F9"))).toBe("F9");
  });
});

describe("prettyShortcut", () => {
  it("reads like the keyboard", () => {
    expect(prettyShortcut("CommandOrControl+Shift+Space")).toBe("Ctrl + Shift + Space");
    expect(prettyShortcut("CommandOrControl+Alt+KeyK")).toBe("Ctrl + Alt + K");
    expect(prettyShortcut("Alt+Digit1")).toBe("Alt + 1");
  });
});
