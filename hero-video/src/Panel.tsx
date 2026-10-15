import { interpolate } from "remotion";
import type { CSSProperties, ReactNode } from "react";
import { C, FONT, FPS, P, clamp, ease, s, inOut } from "./theme";

/* ---------- ícones (mesmo traço do app) ---------- */
const Svg = ({ children, size = 14, style }: { children: ReactNode; size?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children}
  </svg>
);
export const ClockIcon = ({ size = 13 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
  </svg>
);
const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4.5" height="16" rx="1.2" />
    <rect x="13.5" y="4" width="4.5" height="16" rx="1.2" />
  </svg>
);
const Chevron = ({ dir }: { dir: "l" | "r" }) => (
  <Svg size={14}>
    <path d={dir === "l" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </Svg>
);
const PinIcon = () => (
  <Svg size={13}>
    <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
  </Svg>
);
const NoteIcon = () => (
  <Svg size={13}>
    <path d="M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h7" />
  </Svg>
);
const BarsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="11" width="5" height="10" rx="1" />
    <rect x="10" y="4" width="5" height="17" rx="1" />
    <rect x="17" y="8" width="4" height="13" rx="1" />
  </svg>
);
const LinkIcon = () => (
  <Svg size={10}>
    <path d="M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6" />
  </Svg>
);
const Check = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const mmss = (secs: number) => {
  const t = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/* ---------- linha do tempo do cronômetro (time-lapse) ---------- */
export const PLAY_AT = 7.9; // clique no play
export const PLANNED = 25 * 60;
/** fração já trabalhada: o vídeo acelera o tempo pra mostrar a linha se enchendo */
export const fracAt = (frame: number) =>
  interpolate(frame, [s(PLAY_AT), s(10.7), s(18.4), s(20.5)], [0, 0.62, 0.72, 0.8], { ...clamp, easing: inOut });
export const remainingAt = (frame: number) => PLANNED * (1 - fracAt(frame));

/* ---------- Activity (grade) ---------- */
const LV = ["#2a2a2d", "#0b2f56", "#0a4e92", "#0a6cd2", "#0a84ff"];
// linhas S T Q Q S S D; 9 = hoje, 8 = planejado (ponto), 7 = futuro
const GRID: number[] = [
  4, 4, 3, 2, 4, 4, 0,
  4, 4, 3, 4, 4, 4, 0,
  4, 4, 3, 4, 3, 2, 0,
  4, 4, 3, 4, 9, 8, 7,
  7, 7, 7, 7, 7, 7, 7,
];
const GH_DOT = new Set([0, 2, 4, 7, 9, 10, 11, 12, 15, 17, 19, 21, 22, 24, 25, 26, 28]);

const Activity = ({ frame }: { frame: number }) => {
  const t = frame / FPS;
  const wave0 = 18.95; // a grade "acende" quando a narração fala da grade
  const streak = t < 19.55 ? 4 : 5;
  const popStreak = P(frame, 19.55, 19.8);
  return (
    <div style={{ position: "absolute", left: 367, top: 46, right: 0, bottom: 0, borderLeft: `1px solid ${C.line}`, padding: "10px 14px 0 14px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: C.text }}>
        <span style={{ color: C.text }}><BarsIcon /></span> Activity
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.35 }}>
        semana <b style={{ color: C.soft }}>8h 3min</b> ·{" "}
        <b style={{ color: popStreak > 0 && popStreak < 1 ? C.accent : C.soft, display: "inline-block", transform: `scale(${1 + 0.25 * Math.sin(popStreak * Math.PI)})` }}>{streak}</b>{" "}
        dias seguidos
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 20px)", gap: 5, marginTop: 9, fontSize: 8.5, color: C.dim, textAlign: "center" }}>
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 20px)", gap: 5, marginTop: 3 }}>
        {GRID.map((lv, i) => {
          const col = i % 7, row = Math.floor(i / 7);
          const k = interpolate(frame, [s(wave0) + (col + row) * 3, s(wave0) + (col + row) * 3 + 14], [0, 1], { ...clamp, easing: ease });
          const pulse = Math.sin(k * Math.PI);
          const base: CSSProperties = { width: 20, height: 20, borderRadius: 5, boxSizing: "border-box", position: "relative", transform: `scale(${1 + 0.1 * pulse})`, zIndex: pulse > 0.2 ? 1 : 0, filter: `brightness(${1 + 0.55 * pulse})` };
          if (lv === 7) return <div key={i} style={{ ...base, border: `1px solid ${C.btn}` }} />;
          if (lv === 8)
            return (
              <div key={i} style={{ ...base, border: `1px solid ${C.btn}` }}>
                <span style={{ position: "absolute", left: 7.5, top: 7.5, width: 4, height: 4, borderRadius: 4, background: C.accent }} />
              </div>
            );
          if (lv === 9)
            return (
              <div key={i} style={{ ...base, background: LV[4], outline: `2px solid ${C.text}`, outlineOffset: 0 }}>
                <span style={{ position: "absolute", right: 2, top: 2, width: 4, height: 4, borderRadius: 4, background: C.green }} />
              </div>
            );
          return (
            <div key={i} style={{ ...base, background: LV[lv] }}>
              {GH_DOT.has(i) && <span style={{ position: "absolute", right: 2, top: 2, width: 3.5, height: 3.5, borderRadius: 4, background: C.green }} />}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: C.soft, marginTop: 9, lineHeight: 1.35 }}>
        Hoje — {t < 19.6 ? "1h 43min · 1 concluída" : "1h 58min · 2 concluídas"}
      </div>
      <div style={{ position: "absolute", left: 14, bottom: 10, display: "flex", alignItems: "center", gap: 4, fontSize: 8.5, color: C.dim }}>
        menos
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} style={{ width: 8, height: 8, borderRadius: 2, background: LV[l] }} />
        ))}
        mais
        <span style={{ width: 4, height: 4, borderRadius: 4, background: C.green, marginLeft: 6 }} /> GitHub
      </div>
    </div>
  );
};

/* ---------- linha de tarefa ---------- */
interface RowProps {
  y: number;
  title: string;
  proj: string;
  link?: boolean;
  done?: boolean;
  min?: string;
  editing?: boolean;
  running?: boolean;
  remaining?: number;
  pressed?: number;
  appear: number;
  flash?: number;
}
const Row = ({ y, title, proj, link, done, min, editing, running, remaining, pressed = 0, appear, flash = 0 }: RowProps) => (
  <div
    style={{
      position: "absolute", left: 14, top: y, width: 340, height: 38, boxSizing: "border-box", borderRadius: 12, background: C.row,
      border: running ? `1px solid ${C.accent}` : `1px solid transparent`,
      boxShadow: flash > 0 ? `0 0 0 ${1 + flash * 2}px ${C.green}${Math.round(flash * 160).toString(16).padStart(2, "0")}` : undefined,
      display: "flex", alignItems: "center", padding: "0 10px 0 11px", gap: 9, opacity: appear, transform: `translateY(${(1 - appear) * 10}px)`,
    }}
  >
    <span style={{ width: 16, height: 16, borderRadius: 16, boxSizing: "border-box", flex: "none", border: done ? "none" : `1.5px solid ${C.dim}`, background: done ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {done && <Check />}
    </span>
    <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
      <div style={{ fontSize: 12.5, fontWeight: 650, color: done ? C.muted : C.text, textDecoration: done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
        {link && <LinkIcon />}
        {proj}
      </div>
    </div>
    {!done && (
      <>
        <div style={{ flex: "none", height: 26, minWidth: 62, padding: "0 10px", boxSizing: "border-box", borderRadius: 9, background: C.btn, border: editing ? `1px solid ${C.accent}` : "1px solid transparent", boxShadow: editing ? `0 0 14px -2px ${C.accent}` : undefined, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 650, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: C.soft, display: "flex" }}><ClockIcon size={12} /></span>
          {running ? mmss(remaining ?? 0) : min}
        </div>
        <div style={{ flex: "none", width: 26, height: 26, borderRadius: 26, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${1 - pressed * 0.18})`, boxShadow: pressed > 0 ? `0 0 ${14 * pressed}px ${C.accent}` : undefined }}>
          {running ? <PauseIcon /> : <PlayIcon />}
        </div>
        <span style={{ flex: "none", color: C.dim, fontSize: 11, letterSpacing: -2, lineHeight: 1 }}>⋮⋮</span>
      </>
    )}
  </div>
);

/* ---------- aba GitHub ---------- */
interface GhRowProps { y: number; kind: "PR" | "Issue"; title: string; repo: string; added: boolean; click: number; appear: number }
const GhRow = ({ y, kind, title, repo, added, click, appear }: GhRowProps) => (
  <div style={{ position: "absolute", left: 14, top: y, width: 340, height: 50, boxSizing: "border-box", borderRadius: 12, background: C.row, padding: "8px 12px", opacity: appear, transform: `translateY(${(1 - appear) * 12}px)` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1.5px 6px", borderRadius: 5, background: kind === "PR" ? "rgba(48,209,88,.22)" : "rgba(255,159,10,.22)", color: kind === "PR" ? C.green : C.orange }}>{kind}</span>
      <span style={{ fontSize: 12, fontWeight: 650, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
    </div>
    <div style={{ marginTop: 5, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
      <span>{repo}</span>
      {added ? (
        <span style={{ color: C.accent, fontWeight: 600, transform: `scale(${1 + 0.15 * Math.sin(click * Math.PI)})` }}>tarefa · hoje</span>
      ) : (
        <span style={{ position: "absolute", right: 12, bottom: 7, padding: "3px 9px", borderRadius: 8, background: C.btn, color: C.text, fontSize: 10.5, fontWeight: 600 }}>+ hoje</span>
      )}
    </div>
  </div>
);

/* ---------- painel ---------- */
export const Panel = ({ frame }: { frame: number }) => {
  const t = frame / FPS;
  const running = t >= PLAY_AT;
  const remaining = remainingAt(frame);
  const tab = t >= 11.55 && t < 14.6 ? "github" : "tarefas";
  const added = t >= 13.7;
  const pressPlay = P(frame, 7.82, 7.9) * (1 - P(frame, 7.9, 8.1));
  const editing = t >= 6.4 && t < 7.15;
  const minRow2 = t < 6.75 ? "40" : "35";
  const rowAppear = (i: number) => (t < 8 ? P(frame, 5.15 + i * 0.12, 5.6 + i * 0.12) : 1);
  const ghAppear = (i: number) => P(frame, 11.7 + i * 0.13, 12.15 + i * 0.13);
  const addClick = P(frame, 13.7, 14.0);
  const flash = P(frame, 13.7, 13.85) * (1 - P(frame, 13.85, 14.3));

  const header = (
    <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 45, borderBottom: `1px solid ${C.line}`, boxSizing: "border-box" }}>
      <span style={{ position: "absolute", left: 16, top: 15, color: C.muted, display: "flex" }}><Chevron dir="l" /></span>
      <span style={{ position: "absolute", left: 38, top: 11, fontSize: 15, fontWeight: 700, color: C.text }}>Hoje</span>
      <span style={{ position: "absolute", left: 86, top: 15, color: C.muted, display: "flex" }}><Chevron dir="r" /></span>
      <div style={{ position: "absolute", left: 112, top: 7, width: 173, height: 31, borderRadius: 11, background: "#1a1a1d", display: "flex", padding: 3, boxSizing: "border-box", gap: 0 }}>
        {[["Tarefas", 58], ["Resumo", 56], ["GitHub", 56]].map(([name, w]) => {
          const active = (name === "GitHub") === (tab === "github") && name !== "Resumo";
          return (
            <div key={name as string} style={{ width: w as number, height: 25, borderRadius: 8, background: active ? C.tab : "transparent", color: active ? C.text : C.muted, fontSize: 11.5, fontWeight: 650, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {name}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 14, top: 0, height: 45, display: "flex", alignItems: "center", gap: 12, fontSize: 10.5, color: C.muted }}>
        <span>1h 45min · 2 ✓</span>
        <span style={{ display: "flex" }}><NoteIcon /></span>
        <span style={{ display: "flex", color: C.accent }}><PinIcon /></span>
      </div>
    </div>
  );

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 560, height: 300, fontFamily: FONT, color: C.text }}>
      {header}
      <Activity frame={frame} />
      {tab === "tarefas" ? (
        <>
          <Row y={56} title="Escrever testes do carrinho" proj="loja" min="25" running={running} remaining={remaining} pressed={pressPlay} appear={rowAppear(0)} />
          <Row y={100} title="Ajustar o layout do dashboard" proj="virex" min={minRow2} editing={editing} appear={rowAppear(1)} />
          <Row y={144} title="Responder o cliente sobre o prazo" proj="virex" min="10" appear={rowAppear(2)} />
          {added ? (
            <Row y={188} title="Corrigir fuso no resumo semanal" proj="sthevan027/focusbrew #31" link min="30" appear={1} flash={flash} />
          ) : (
            <Row y={188} title="Revisar o PR do login" proj="exemplo/app #12" link done appear={rowAppear(3)} />
          )}
        </>
      ) : (
        <>
          <GhRow y={56} kind="PR" title="#31 Corrigir fuso no resumo semanal" repo="sthevan027/focusbrew" added={added} click={addClick} appear={ghAppear(0)} />
          <GhRow y={112} kind="PR" title="#30 Feed 3 + Stores no app" repo="sthevan027/Strivo" added={false} click={0} appear={ghAppear(1)} />
          <GhRow y={168} kind="Issue" title="#12 Gráfico de avanço por disciplina" repo="sthevan027/painel" added={false} click={0} appear={ghAppear(2)} />
        </>
      )}
      <div style={{ position: "absolute", left: 22, bottom: 14, fontSize: 11.5, color: C.dim }}>
        {tab === "tarefas" ? "Adicionar tarefa — #projeto no fim" : "PRs e issues abertos pra você"}
      </div>
    </div>
  );
};
