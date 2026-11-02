import halloweenManifest from "./halloween-abobora/theme.json";
import halloweenCss from "./halloween-abobora/theme.css?raw";
import { DEFAULT_THEME, buildPackage, fontFaceCss } from "../lib/themeLoader";
import type { ThemePackage, ThemeSource } from "../lib/themeLoader";
import { validateManifest } from "../lib/themeManifest";

/** Sound sets the app synthesizes itself (see lib/sound.ts). */
export const SOUND_SETS = ["abobora"] as const;

/** Font files of the built-in packages, as URLs the build made (`?url`), keyed by path. */
const FONT_URLS = import.meta.glob("./*/assets/fonts/*", { eager: true, query: "?url", import: "default" }) as Record<
  string,
  string
>;

interface BuiltinTheme {
  /** The package folder under src/themes. */
  dir: string;
  source: ThemeSource;
}

/** The themes shipped inside the app. A store would add entries here, validated the same way. */
const BUILTIN: Record<string, BuiltinTheme> = {
  "halloween-abobora": {
    dir: "halloween-abobora",
    source: { manifest: halloweenManifest, css: halloweenCss },
  },
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

/**
 * The validated package for an id, or null for the default or an unknown/invalid id.
 * The package's @font-face rules go in front of its own stylesheet.
 */
export function packageFor(id: string): ThemePackage | null {
  const builtin = BUILTIN[id];
  if (!builtin) return null;
  const parsed = validateManifest(builtin.source.manifest, SOUND_SETS);
  if (!parsed.ok) return null;
  const fonts = fontFaceCss(parsed.manifest.fonts, (file) => FONT_URLS[`./${builtin.dir}/${file}`]);
  const result = buildPackage({ manifest: builtin.source.manifest, css: `${fonts}\n${builtin.source.css}` }, SOUND_SETS);
  return result.ok ? result.pkg : null;
}
