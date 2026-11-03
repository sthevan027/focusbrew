import type { PumpkinFace } from "./pumpkinState";

/**
 * The pumpkin, drawn with the shapes of the Doop frames (2 and 4). The theme's
 * CSS gives it the color glow; this file only draws the face.
 */
export default function Pumpkin({ face, className }: { face: PumpkinFace; className?: string }) {
  return (
    <svg
      className={`pumpkin pumpkin-${face}${className ? ` ${className}` : ""}`}
      viewBox="0 0 96 88"
      aria-hidden="true"
      focusable="false"
    >
      <path className="pumpkin-stem" d="M46 14c-1-7 3-12 9-14 1 4-1 9-5 14z" />
      <ellipse className="pumpkin-body-side" cx="26" cy="52" rx="21" ry="32" />
      <ellipse className="pumpkin-body-side" cx="70" cy="52" rx="21" ry="32" />
      <ellipse className="pumpkin-body" cx="48" cy="52" rx="44" ry="33" />
      <ellipse className="pumpkin-body-center" cx="48" cy="52" rx="19" ry="33" />
      {face === "closed" ? (
        <g className="pumpkin-face">
          <path className="pumpkin-line" d="M28 47q6 5 12 0M56 47q6 5 12 0" />
          <path className="pumpkin-line" d="M38 64h20" />
        </g>
      ) : (
        <g className="pumpkin-face">
          <path className="pumpkin-eye" d="M30 41l10 8-12 2zM66 41l-10 8 12 2z" />
          {face === "open" ? (
            <>
              <path className="pumpkin-mouth" d="M30 62q18 22 36 0q-18 6-36 0z" />
              <path className="pumpkin-teeth" d="M42 66l3 5 3-5zM52 66l3 5 3-5z" />
            </>
          ) : (
            <path className="pumpkin-line" d="M32 64q16 9 32 0" />
          )}
        </g>
      )}
    </svg>
  );
}
