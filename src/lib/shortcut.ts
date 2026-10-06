export interface KeyCombo {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/**
 * A pressed combination as the backend writes shortcuts
 * ("CommandOrControl+Shift+Space"), or null while it isn't one yet: only
 * modifiers so far, or a plain key (that would steal normal typing).
 * F-keys may go alone.
 */
export function comboFromKeys(e: KeyCombo): string | null {
  if (MODIFIER_CODES.test(e.code)) return null;
  const fKey = /^F\d{1,2}$/.test(e.code);
  if (!fKey && !e.ctrlKey && !e.altKey && !e.metaKey) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("CommandOrControl");
  if (e.metaKey) parts.push("Super");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.code);
  return parts.join("+");
}

/** "CommandOrControl+Alt+KeyK" -> "Ctrl + Alt + K". */
export function prettyShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((p) =>
      p === "CommandOrControl"
        ? "Ctrl"
        : p === "Super"
          ? "Win"
          : p.replace(/^Key([A-Z])$/, "$1").replace(/^Digit(\d)$/, "$1"),
    )
    .join(" + ");
}
