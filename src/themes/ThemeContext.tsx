import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { Mascot } from "../lib/themeManifest";

/** What the active theme adds to the widget. The default theme adds nothing. */
export interface ThemeFeatures {
  mascot: Mascot;
  /** The theme has sounds and the "Sons do tema" switch is on. */
  sounds: boolean;
}

export const NO_FEATURES: ThemeFeatures = { mascot: "none", sounds: false };

const ThemeFeaturesContext = createContext<ThemeFeatures>(NO_FEATURES);

export function ThemeFeaturesProvider({ value, children }: { value: ThemeFeatures; children: ReactNode }) {
  return <ThemeFeaturesContext.Provider value={value}>{children}</ThemeFeaturesContext.Provider>;
}

export function useThemeFeatures(): ThemeFeatures {
  return useContext(ThemeFeaturesContext);
}
