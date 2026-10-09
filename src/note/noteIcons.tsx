import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const NOTE_ICONS = {
  history: () => (<Icon><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></Icon>),
  plus: () => (<Icon><path d="M12 5v14" /><path d="M5 12h14" /></Icon>),
  close: () => (<Icon><path d="M6 6l12 12" /><path d="M18 6L6 18" /></Icon>),
  undo: () => (<Icon><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Icon>),
  redo: () => (<Icon><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></Icon>),
  copy: () => (<Icon><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>),
  placement: () => (<Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" /></Icon>),
  select: () => (<Icon><path d="M5 3l14 8-6 2-2 6z" /></Icon>),
  pen: () => (<Icon><path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z" /><path d="M14 7l3 3" /></Icon>),
  rect: () => (<Icon><rect x="4" y="5" width="16" height="14" rx="1" /></Icon>),
  ellipse: () => (<Icon><ellipse cx="12" cy="12" rx="9" ry="7" /></Icon>),
  triangle: () => (<Icon><path d="M12 4l9 16H3z" /></Icon>),
  line: () => (<Icon><path d="M5 19L19 5" /></Icon>),
  arrow: () => (<Icon><path d="M5 19L19 5" /><path d="M9 5h10v10" /></Icon>),
  eraser: () => (<Icon><path d="M7 21h12" /><path d="M5.5 14.5l8-8a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L11 20H7l-1.5-1.5a2 2 0 0 1 0-3z" /></Icon>),
  fill: () => (<Icon><rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" fillOpacity="0.35" /></Icon>),
};
