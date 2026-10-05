import type { ReactNode } from "react";
import type { AppConfig } from "../lib/types";

export interface SectionProps {
  config: AppConfig;
  /** Applies a change right away (there is no Save button). */
  set: (patch: Partial<AppConfig>) => void;
}

interface RowProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

/** A line of a settings group: label on the left, the control on the right. */
export default function Row({ title, hint, children }: RowProps) {
  return (
    <div className="row">
      <div>
        <div className="row-title">{title}</div>
        {hint && <div className="row-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
