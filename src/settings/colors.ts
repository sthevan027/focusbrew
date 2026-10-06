/** Ready-made accent colors; the first is the default blue. */
export const ACCENT_PRESETS = [
  { name: "Azul", hex: "#0A84FF" },
  { name: "Roxo", hex: "#BF5AF2" },
  { name: "Rosa", hex: "#FF375F" },
  { name: "Laranja", hex: "#FF9F0A" },
  { name: "Verde", hex: "#30D158" },
  { name: "Turquesa", hex: "#64D2FF" },
] as const;

/** "#rrggbb" in any case (and surrounding spaces) -> "#RRGGBB"; anything else -> null. Mirrors `normalize_hex` in config.rs. */
export function normalizeHex(raw: string): string | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(raw.trim());
  return match ? `#${match[1].toUpperCase()}` : null;
}
