import type { ReactNode } from "react";

/**
 * The sidebar icons of the settings window, one family: a 24 grid, 2 px
 * rounded strokes, only `currentColor` (the button sets the color). Concepts:
 * Foco = stopwatch, Projetos = folder, Notch = a screen with the widget
 * hanging from its top edge, Geral = sliders, GitHub = a branch.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const SECTION_ICONS = {
  focus: () => (
    <Icon>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5" />
      <path d="M12 6V3.5" />
      <path d="M9.5 3h5" />
    </Icon>
  ),
  notch: () => (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7.5 4v4a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V4z" fill="currentColor" />
    </Icon>
  ),
  general: () => (
    <Icon>
      <path d="M4 6h9" />
      <circle cx="15" cy="6" r="2.4" />
      <path d="M17.4 6H20" />
      <path d="M4 12h2.6" />
      <circle cx="9" cy="12" r="2.4" />
      <path d="M11.4 12H20" />
      <path d="M4 18h6.6" />
      <circle cx="13" cy="18" r="2.4" />
      <path d="M15.4 18H20" />
    </Icon>
  ),
  github: () => (
    <Icon>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="7" r="2" />
      <path d="M6 7v10" />
      <path d="M18 9v1a5 5 0 0 1-5 5H6" />
    </Icon>
  ),
};
