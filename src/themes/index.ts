import halloweenManifest from "./halloween-abobora/theme.json";
import halloweenCss from "./halloween-abobora/theme.css?raw";
import { DEFAULT_THEME, buildPackage } from "../lib/themeLoader";
import type { ThemePackage, ThemeSource } from "../lib/themeLoader";

/** Sound sets the app synthesizes itself (see lib/sound.ts). */
export const SOUND_SETS = ["abobora"] as const;

/** The themes shipped inside the app. A store would add entries here, validated the same way. */
const BUILTIN: Record<string, ThemeSource> = {
  "halloween-abobora": { manifest: halloweenManifest, css: halloweenCss },
};

export interface ThemeOption {
  id: string;
  name: string;
}

/** The choices for the settings picker: the default first, then the packages by name. */
export function themeOptions(): ThemeOption[] {
  const packages = Object.keys(BUILTIN)
    .map((id) => packageFor(id))
    .filter((pkg): pkg is ThemePackage => pkg !== null)
    .map((pkg) => ({ id: pkg.manifest.id, name: pkg.manifest.name }));
  return [{ id: DEFAULT_THEME, name: "Padrão" }, ...packages];
}

/** The validated package for an id, or null for the default or an unknown/invalid id. */
export function packageFor(id: string): ThemePackage | null {
  const source = BUILTIN[id];
  if (!source) return null;
  const result = buildPackage(source, SOUND_SETS);
  return result.ok ? result.pkg : null;
}
