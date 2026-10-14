import { interpolate } from "remotion";
import type { CSSProperties, ReactElement } from "react";
import { C, FONT, P, clamp, ease, s } from "./theme";

const TEXT = "Ideias da sprint\n- filtro por projeto\n- exportar CSV";
const DOTS = ["#f2f2f3", "#ffd60a", "#ff453a", "#30d158", "#0a84ff", "#ff6bd1"];

const Ico = ({ d, active, size = 14 }: { d: string; active?: boolean; size?: number }) => (
  <span style={{ width: 26, height: 24, borderRadius: 7, background: active ? C.accent : "transparent", color: active ? "#fff" : C.soft, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  </span>
);

const Draw = ({ frame, a, b, children }: { frame: number; a: number; b: number; children: (k: number) => ReactElement }) => children(P(frame, a, b, ease));

/** Nota rápida (Ctrl+Alt+N): texto e desenho à mão livre. */
export const Note = ({ frame }: { frame: number }) => {
  const typed = Math.floor(interpolate(frame, [s(17.15), s(17.72)], [0, TEXT.length], clamp));
  const showCaret = frame < s(18.2) && Math.floor(frame / 8) % 2 === 0;
  const shown = TEXT.slice(0, typed);
  const tb: CSSProperties = { display: "flex", alignItems: "center", gap: 2 };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 560, height: 380, fontFamily: FONT, color: C.text }}>
      <div style={{ ...tb, height: 34, padding: "0 10px", justifyContent: "space-between" }}>
        <div style={tb}>
          <Ico d="M4 7h16M4 12h16M4 17h16" />
          <Ico d="M12 5v14M5 12h14" />
          <span style={{ fontSize: 12, fontWeight: 700, padding: "0 8px", color: C.soft }}>Aa</span>
          <Ico d="M4 20l4-1 11-11-3-3L5 16z" active />
        </div>
        <div style={tb}>
          <Ico d="M4 5h16v14H4z M4 9h16" />
          <Ico d="M8 8h11v11H8z M5 16V5h11" />
          <Ico d="M9 14l-4-4 4-4 M5 10h9a5 5 0 0 1 0 10h-2" />
          <Ico d="M6 6l12 12M18 6L6 18" />
        </div>
      </div>
      <div style={{ ...tb, height: 34, padding: "0 10px", gap: 3, borderTop: `1px solid ${C.line}` }}>
        <Ico d="M5 3l14 9-6 1.5L10 20z" active />
        <Ico d="M4 20l4-1 11-11-3-3L5 16z" />
        <Ico d="M5 6h14v12H5z" />
        <Ico d="M12 6c4.5 0 8 2.7 8 6s-3.5 6-8 6-8-2.7-8-6 3.5-6 8-6z" />
        <Ico d="M12 5l8 14H4z" />
        <Ico d="M5 19L19 5" />
        <Ico d="M5 19L19 5 M10 5h9v9" />
        <Ico d="M7 18l-3-3 9-9 6 6-6 6h-6" />
        <span style={{ width: 1, height: 18, background: C.line, margin: "0 6px" }} />
        {DOTS.map((c) => (
          <span key={c} style={{ width: 15, height: 15, borderRadius: 15, background: c, margin: "0 2.5px", outline: c === "#0a84ff" ? `2px solid ${C.text}` : "none", outlineOffset: 1 }} />
        ))}
        <span style={{ width: 1, height: 18, background: C.line, margin: "0 6px" }} />
        {[3, 5, 7].map((d, i) => (
          <span key={d} style={{ width: 22, height: 22, borderRadius: 7, background: i === 1 ? C.tab : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: d, height: d, borderRadius: d, background: C.text }} />
          </span>
        ))}
      </div>
      <div style={{ position: "absolute", left: 16, top: 82, fontSize: 14.5, lineHeight: 1.45, whiteSpace: "pre", color: C.text }}>
        {shown}
        {showCaret && <span style={{ display: "inline-block", width: 1.5, height: 15, background: C.accent, verticalAlign: -2, marginLeft: 1 }} />}
      </div>
      <svg style={{ position: "absolute", left: 0, top: 0 }} width="560" height="380" viewBox="0 0 560 380" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <Draw frame={frame} a={17.5} b={17.85}>
          {(k) => <rect x="326" y="128" width="124" height="70" rx="1" stroke={C.accent} strokeWidth="3.4" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} />}
        </Draw>
        <Draw frame={frame} a={17.7} b={18.0}>
          {(k) => (
            <g stroke="#ffd60a" strokeWidth="3.4" pathLength={1}>
              <path d="M500 262 L452 204" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} />
              <path d="M452 204 L452 222 M452 204 L470 208" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.max(0, (k - 0.6) / 0.4)} />
            </g>
          )}
        </Draw>
        <Draw frame={frame} a={17.55} b={18.0}>
          {(k) => <ellipse cx="190" cy="262" rx="66" ry="44" stroke={C.green} strokeWidth="3.4" fill={`rgba(48,209,88,${0.22 * k})`} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} />}
        </Draw>
        <Draw frame={frame} a={17.75} b={18.1}>
          {(k) => <path d="M318 330 L330 308 L342 336 L354 308 L366 336 L378 308 L390 336 L402 316" stroke="#ff6bd1" strokeWidth="3.4" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} />}
        </Draw>
      </svg>
    </div>
  );
};
