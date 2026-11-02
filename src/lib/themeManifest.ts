/**
 * The shape of a theme package's `theme.json`, and its validation. A theme is
 * data plus CSS and assets: nothing here runs code from the package. The same
 * check guards the built-in themes today and the store later.
 */

/** Largest `theme.css` the loader accepts (the file is injected as a style element). */
export const MAX_THEME_CSS_BYTES = 200_000;
/** Largest font file the loader accepts. */
export const MAX_THEME_FONT_BYTES = 300_000;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FONT_EXTENSIONS = [".woff2", ".woff", ".ttf"];

export interface ThemeFont {
  family: string;
  /** Path inside the package, e.g. `assets/fonts/PirataOne.woff2`. */
  file: string;
}

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  /** Fixed accent of the theme; null = the user's accent color applies. */
  accent: string | null;
  fonts: ThemeFont[];
  /** Path to the stylesheet inside the package. */
  css: string;
  /** Built-in sound set id, or "none". Sound files are not part of a package yet. */
  sounds: string;
}

export type ManifestResult = { ok: true; manifest: ThemeManifest } | { ok: false; errors: string[] };

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A relative path inside the package: no absolute path, no `..`, no backslashes. */
function safeRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !/^[a-zA-Z]:/.test(value) &&
    !value.split("/").includes("..")
  );
}

export function validateManifest(raw: unknown, soundSets: readonly string[]): ManifestResult {
  if (!isObject(raw)) return { ok: false, errors: ["o manifesto precisa ser um objeto JSON"] };
  const errors: string[] = [];

  const { id, name, version, author, accent, fonts, css, sounds } = raw;

  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    errors.push("id: use 1 a 40 caracteres minúsculos, números ou hífen");
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 60) {
    errors.push("name: texto de 1 a 60 caracteres");
  }
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
    errors.push("version: no formato X.Y.Z");
  }
  if (typeof author !== "string" || author.trim().length === 0 || author.length > 80) {
    errors.push("author: texto de 1 a 80 caracteres");
  }

  let accentValue: string | null = null;
  if (accent !== undefined && accent !== null) {
    if (typeof accent === "string" && HEX_PATTERN.test(accent)) accentValue = accent;
    else errors.push("accent: cor hexadecimal de 6 dígitos (#RRGGBB)");
  }

  if (!safeRelativePath(css) || !css.endsWith(".css")) {
    errors.push("css: caminho relativo para um arquivo .css dentro do pacote");
  }

  const fontList: ThemeFont[] = [];
  if (fonts !== undefined) {
    if (!Array.isArray(fonts)) {
      errors.push("fonts: lista de { family, file }");
    } else {
      fonts.forEach((font, index) => {
        if (!isObject(font) || typeof font.family !== "string" || font.family.trim().length === 0) {
          errors.push(`fonts[${index}].family: nome da família obrigatório`);
          return;
        }
        if (!safeRelativePath(font.file) || !FONT_EXTENSIONS.some((ext) => (font.file as string).endsWith(ext))) {
          errors.push(`fonts[${index}].file: caminho relativo para .woff2, .woff ou .ttf`);
          return;
        }
        fontList.push({ family: font.family, file: font.file });
      });
    }
  }

  let soundValue = "none";
  if (sounds !== undefined) {
    if (typeof sounds === "string" && (sounds === "none" || soundSets.includes(sounds))) soundValue = sounds;
    else errors.push(`sounds: conjunto desconhecido (use "none" ou um de: ${soundSets.join(", ")})`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    manifest: {
      id: id as string,
      name: (name as string).trim(),
      version: version as string,
      author: (author as string).trim(),
      accent: accentValue,
      fonts: fontList,
      css: css as string,
      sounds: soundValue,
    },
  };
}
