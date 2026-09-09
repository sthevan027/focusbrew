// Lightweight stand-in for real extracted .exe icons (that needs Win32 GDI
// calls we haven't built yet) — a colored monogram badge, grouped by what
// kind of tool it is. AI CLIs get the same amber as the rest of the brand
// since detecting them is the whole point of this app.
export type AppCategory = "ai" | "editor" | "terminal" | "other";

const CATEGORY_COLOR: Record<AppCategory, string> = {
  ai: "var(--brew)",
  editor: "#5b8dd6",
  terminal: "#8d99a6",
  other: "var(--muted)",
};

const MONOGRAM_OVERRIDES: Record<string, string> = {
  code: "VS",
  "code.exe": "VS",
  cursor: "CU",
  "cursor.exe": "CU",
  claude: "CL",
  pwsh: "PS",
  "pwsh.exe": "PS",
  windowsterminal: "WT",
  "windowsterminal.exe": "WT",
};

function categoryFor(name: string): AppCategory {
  const n = name.toLowerCase();
  if (/claude|codex|gemini-cli|copilot/.test(n)) return "ai";
  if (/code|cursor|webstorm|idea|sublime|neovim|^vim/.test(n)) return "editor";
  if (/pwsh|powershell|cmd|terminal|bash|zsh|conemu|alacritty|wezterm/.test(n)) return "terminal";
  return "other";
}

function monogramFor(name: string): string {
  const key = name.toLowerCase();
  if (MONOGRAM_OVERRIDES[key]) return MONOGRAM_OVERRIDES[key];
  const clean = name.replace(/\.exe$/i, "");
  const words = clean
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export function appBadge(name: string): { monogram: string; color: string } {
  return { monogram: monogramFor(name), color: CATEGORY_COLOR[categoryFor(name)] };
}
