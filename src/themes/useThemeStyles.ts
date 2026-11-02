import { useEffect, useMemo } from "react";
import { applyTheme, markRoot } from "../lib/themeLoader";
import type { ThemePackage } from "../lib/themeLoader";
import { packageFor } from "./index";

/**
 * Applies the theme of this window: its stylesheet in the document, and the
 * `data-theme` marker on the document root (the settings and note windows have
 * no `.widget-root`; the widget also marks its own root in Widget.tsx).
 * Returns the validated package, or null for the default theme.
 */
export function useThemeStyles(themeId: string): ThemePackage | null {
  const pkg = useMemo(() => packageFor(themeId), [themeId]);
  useEffect(() => {
    applyTheme(document, themeId, pkg);
    markRoot(document.documentElement, themeId);
  }, [themeId, pkg]);
  return pkg;
}
