import { AbsoluteFill, Audio, Easing, interpolate, interpolateColors, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CSSProperties, ReactNode } from "react";
import { C, FONT, FPS, MONO, P, clamp, ease, grow, inOut, s, shrink, win } from "./theme";
import { ClockIcon, Panel, PLAY_AT, fracAt, mmss, remainingAt } from "./Panel";
import { Note } from "./Note";

export { FPS };
export const DURATION = s(27.2);

/** Escala do notch no vídeo: o app é pequeno de verdade (560 px), aqui aparece grande. */
const S = 2.2;
const CX = 960;

/* ---------- forma do notch: barra → caixa → painel → nota (tamanhos reais do app) ---------- */
interface Step { at: number; dur: number; w: number; h: number; e?: (t: number) => number }
const STEPS: Step[] = [
  { at: 1.75, dur: 0.55, w: 140, h: 6, e: grow }, // barra parada
  { at: 4.95, dur: 0.6, w: 560, h: 300, e: grow }, // mouse em cima: painel abre
  { at: 8.4, dur: 0.38, w: 320, h: 44, e: shrink }, // play → caixa com a contagem
  { at: 11.0, dur: 0.6, w: 560, h: 300, e: grow }, // mouse em cima: painel (GitHub)
  { at: 14.3, dur: 0.38, w: 320, h: 44, e: shrink },
  { at: 16.95, dur: 0.55, w: 560, h: 380, e: grow }, // Ctrl+Alt+N: nota rápida
  { at: 18.2, dur: 0.45, w: 560, h: 300, e: shrink }, // volta pro painel (grade)
  { at: 20.5, dur: 0.4, w: 0, h: 0, e: shrink },
];
function shapeAt(frame: number) {
  let w = 0, h = 0;
  for (const st of STEPS) {
    const p = P(frame, st.at, st.at + st.dur, st.e ?? ease);
    if (p < 1) return { w: w + (st.w - w) * p, h: h + (st.h - h) * p };
    w = st.w; h = st.h;
  }
  return { w, h };
}

/* ---------- peças ---------- */
const Logo = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bean" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#d98a3d" />
        <stop offset="100%" stopColor="#8a4a1e" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="#1c1c1e" />
    <path d="M32 14c-10 0-17 8-17 18s7 18 17 18 17-8 17-18-7-18-17-18z" fill="url(#bean)" />
    <path d="M32 16c-5 6-5 12 0 18s5 12 0 18" stroke="#1c1c1e" strokeWidth="4" fill="none" strokeLinecap="round" />
  </svg>
);

const Cursor = ({ x, y, press }: { x: number; y: number; press: number }) => (
  <svg width="46" height="46" viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, transform: `scale(${1 - press * 0.16})`, transformOrigin: "4px 2px", filter: "drop-shadow(0 4px 6px rgba(0,0,0,.65))", zIndex: 60 }}>
    <path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.2 20.4 L11.2 13.7 L17.5 13.4 Z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);
/** pulso de clique em torno de `t` */
const bump = (frame: number, t: number) => {
  const p = (frame - s(t)) / s(0.22);
  return p < 0 || p > 1 ? 0 : Math.sin(p * Math.PI);
};
const clicks = (frame: number, ts: number[]) => Math.max(...ts.map((t) => bump(frame, t)));
/** caminho do cursor por pontos [segundos, x, y] */
const cursorPath = (frame: number, pts: [number, number, number][]) => ({
  x: interpolate(frame, pts.map((p) => s(p[0])), pts.map((p) => p[1]), { ...clamp, easing: inOut }),
  y: interpolate(frame, pts.map((p) => s(p[0])), pts.map((p) => p[2]), { ...clamp, easing: inOut }),
});

const Caption = ({ children, from, to, style }: { children: ReactNode; from: number; to: number; style?: CSSProperties }) => {
  const f = useCurrentFrame();
  const i = P(f, from, from + 0.4), o = P(f, to - 0.18, to);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.04, opacity: i * (1 - o), transform: `translateY(${(1 - i) * 30 - o * 14}px)`, textShadow: "0 4px 30px rgba(0,0,0,.85)", ...style }}>
      {children}
    </div>
  );
};
const Hi = ({ children, color = C.accent }: { children: ReactNode; color?: string }) => <span style={{ color }}>{children}</span>;
const BOTTOM: CSSProperties = { bottom: 46, fontSize: 88 };

const Chip = ({ children, at }: { children: ReactNode; at: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f - s(at), fps, config: { damping: 14, stiffness: 120 } });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "24px 40px", borderRadius: 22, background: "#141416", border: `1px solid #26262a`, fontFamily: FONT, fontSize: 46, fontWeight: 650, opacity: Math.min(k, 1), transform: `translateY(${(1 - k) * 60}px) scale(${0.9 + k * 0.1})`, boxShadow: `0 0 80px -30px ${C.accent}` }}>
      <span style={{ width: 52, height: 52, borderRadius: 99, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, color: "#fff" }}>✓</span>
      {children}
    </div>
  );
};

const Key = ({ label, at, wide }: { label: string; at: number; wide?: boolean }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f - s(at), fps, config: { damping: 11, stiffness: 190 } });
  const flash = P(f, at, at + 0.12) * (1 - P(f, at + 0.12, at + 0.5));
  return (
    <div style={{ width: wide ? 190 : 150, height: 128, borderRadius: 24, background: "#1b1b1f", border: `2px solid ${flash > 0.05 ? C.accent : "#34343a"}`, borderBottomWidth: 9, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 58, fontWeight: 700, color: C.text, opacity: Math.min(k, 1), transform: `translateY(${(1 - k) * 50 + flash * 7}px) scale(${0.85 + 0.15 * Math.min(k, 1.1)})`, boxShadow: `0 0 ${20 + flash * 90}px -6px ${C.accent}` }}>
      {label}
    </div>
  );
};

/* ---------- área de trabalho: um editor de verdade, com o dia do dev ---------- */
const kw = "#569cd6", str = "#ce9178", fn = "#dcdcaa", id = "#9cdcfe", num = "#b5cea8", pn = "#d4d4d4", cm = "#6a9955";
type Tok = [string, string];
const CODE: Tok[][] = [
  [["import ", kw], ["{ ", pn], ["describe, it, expect", id], [" } ", pn], ["from ", kw], ['"vitest"', str], [";", pn]],
  [["import ", kw], ["{ ", pn], ["addItem, total", id], [" } ", pn], ["from ", kw], ['"./carrinho"', str], [";", pn]],
  [],
  [["describe", fn], ["(", pn], ['"carrinho"', str], [", () => {", pn]],
  [["  it", fn], ["(", pn], ['"soma o total dos itens"', str], [", () => {", pn]],
  [["    const ", kw], ["cart ", id], ["= ", pn], ["addItem", fn], ["([], { id: ", pn], ["1", num], [", preco: ", pn], ["40", num], [" });", pn]],
  [["    expect", fn], ["(", pn], ["total", fn], ["(cart)).", pn], ["toBe", fn], ["(", pn], ["40", num], [");", pn]],
  [["  });", pn]],
  [],
  [["  it", fn], ["(", pn], ['"aplica o cupom de desconto"', str], [", () => {", pn]],
  [["    const ", kw], ["cart ", id], ["= ", pn], ["addItem", fn], ["([], { id: ", pn], ["2", num], [", preco: ", pn], ["100", num], [" });", pn]],
  [["    expect", fn], ["(", pn], ["total", fn], ["(cart, ", pn], ['"DEZ"', str], ["))", pn], [".", pn], ["toBe", fn], ["(", pn], ["90", num], [");", pn]],
  [["  });", pn]],
  [],
  [["  // TODO: cupom expirado", cm]],
  [["  it.todo", fn], ["(", pn], ['"recusa cupom expirado"', str], [");", pn]],
  [["});", pn]],
];
const FILES = ["src", "  carrinho", "    carrinho.ts", "    carrinho.test.ts", "    checkout.ts", "  pagamento", "    pix.ts", "package.json", "vitest.config.ts"];

const Desktop = () => (
  <AbsoluteFill style={{ background: "linear-gradient(135deg,#1a0f38 0%,#2b1a57 46%,#0f1a33 100%)" }}>
    <div style={{ position: "absolute", left: 90, top: 78, width: 1740, height: 930, borderRadius: 18, background: "#1b1b1f", border: "1px solid #2e2e34", boxShadow: "0 50px 120px -20px rgba(0,0,0,.75)", overflow: "hidden", fontFamily: FONT }}>
      <div style={{ height: 52, background: "#141416", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", borderBottom: "1px solid #2a2a2f" }}>
        <span style={{ color: C.muted, fontSize: 20 }}>carrinho.test.ts — loja — Code</span>
        <span style={{ color: C.muted, fontSize: 22, letterSpacing: 26 }}>–▢✕</span>
      </div>
      <div style={{ display: "flex", height: 878 }}>
        <div style={{ width: 300, background: "#17171a", borderRight: "1px solid #2a2a2f", padding: "20px 0", fontSize: 21, color: "#b4b4ba", whiteSpace: "pre" }}>
          <div style={{ fontSize: 16, letterSpacing: 2, color: C.dim, padding: "0 22px 12px" }}>EXPLORADOR</div>
          {FILES.map((f) => (
            <div key={f} style={{ padding: "5px 22px", background: f.includes("test.ts") ? "#26262c" : "transparent", color: f.includes("test.ts") ? C.text : undefined }}>{f}</div>
          ))}
        </div>
        <div style={{ flex: 1, padding: "26px 0", fontFamily: MONO, fontSize: 26, lineHeight: "40px" }}>
          {CODE.map((line, i) => (
            <div key={i} style={{ display: "flex", whiteSpace: "pre" }}>
              <span style={{ width: 84, textAlign: "right", paddingRight: 28, color: "#4a4a52", flex: "none" }}>{i + 1}</span>
              {line.map(([t, c], j) => <span key={j} style={{ color: c }}>{t}</span>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

/* ---------- composição ---------- */
export const Hero = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / FPS;

  const { w, h } = shapeAt(frame);
  const rad = interpolate(h, [0, 6, 44, 300], [0, 4, 14, 18], clamp);
  const shellBg = interpolateColors(h, [60, 200], [C.shell, C.bg]);
  const outline = interpolate(h, [60, 200], [0, 1], clamp);
  const running = t >= PLAY_AT && t < 20.5;

  const boxOp = win(frame, 8.55, 10.95, 0.2, 0.12) + win(frame, 14.5, 16.9, 0.2, 0.12);
  const panelOp = win(frame, 5.2, 8.3, 0.25, 0.12) + win(frame, 11.3, 14.2, 0.25, 0.12) + win(frame, 18.42, 20.4, 0.2, 0.12);
  const noteOp = win(frame, 17.2, 18.12, 0.22, 0.1);

  // linha de progresso em "U" (desce pela esquerda, passa embaixo, sobe pela direita)
  const frac = fracAt(frame);
  const r = Math.max(0, Math.min(rad, h - 1, (w - 2) / 2));
  const uPath = `M 1 0 L 1 ${h - 1 - r} A ${r} ${r} 0 0 0 ${1 + r} ${h - 1} L ${w - 1 - r} ${h - 1} A ${r} ${r} 0 0 0 ${w - 1} ${h - 1 - r} L ${w - 1} 0`;
  const lineOp = P(frame, PLAY_AT, PLAY_AT + 0.15) * (1 - P(frame, 20.4, 20.6));

  // "ping" na barra parada
  const pinging = t > 2.0 && t < 4.9;
  const ping = pinging ? ((frame - s(2.0)) % s(1.0)) / s(1.0) : 0;
  const pingOp = pinging ? (1 - ping) * 0.9 : 0;

  // cursor: passa o mouse na barra, planeja, dá play, abre o GitHub, clica "+ hoje"
  const cur = cursorPath(frame, [
    [4.3, 1250, -40], [4.85, 960, 22], [5.7, 962, 36], [6.35, 907, 262], [7.1, 907, 262], [7.8, 1026, 167], [7.95, 1026, 167], [8.4, 1420, 760],
    [10.5, 1420, 760], [10.95, 960, 26], [11.15, 960, 40], [11.5, 909, 48], [11.65, 909, 48], [12.3, 980, 150], [13.4, 1035, 178], [13.8, 1035, 178], [14.25, 1420, 780],
  ]);
  const curOp = win(frame, 4.3, 14.2, 0.25, 0.2);
  const curPress = clicks(frame, [7.88, 11.55, 13.72]);

  // atalho
  const keys = win(frame, 15.5, 17.0, 0.1, 0.25);

  // fim: tela, chips, CTA
  const stageA = 1 - P(frame, 20.5, 20.9);
  const hook = 1 - P(frame, 1.3, 1.9);
  const dim = 0.16 + 0.3 * hook + 0.2 * interpolate(h, [6, 300], [0, 1], clamp);
  const chipsA = P(frame, 20.6, 20.9) * (1 - P(frame, 23.2, 23.5));
  const cta = P(frame, 23.45, 24.0);
  const btnClick = bump(frame, 24.22);
  const dl = P(frame, 24.45, 26.35, Easing.inOut(Easing.quad));
  const cta2 = cursorPath(frame, [[23.2, 1360, 940], [24.2, 1215, 762], [24.5, 1215, 762], [25.3, 1330, 860]]);
  const cta2Op = P(frame, 23.2, 23.5);
  const glow = 60 + Math.sin(frame / 6) * 28;

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.text, overflow: "hidden" }}>
      {/* fundo do final: grade + brilho azul */}
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(to right, rgba(242,242,243,.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(242,242,243,.045) 1px, transparent 1px)", backgroundSize: "64px 64px", backgroundPosition: `${(frame / FPS) * 6}px ${(frame / FPS) * 6}px`, WebkitMaskImage: "radial-gradient(ellipse at 50% 35%, #000 25%, transparent 75%)" }} />
      <AbsoluteFill style={{ background: `radial-gradient(55% 50% at ${35 + Math.sin(frame / 90) * 6}% 90%, ${C.accent}55, transparent 70%)` }} />

      {/* a tela do dev */}
      <AbsoluteFill style={{ opacity: stageA }}>
        <AbsoluteFill style={{ filter: hook > 0.01 ? `blur(${hook * 14}px)` : undefined }}><Desktop /></AbsoluteFill>
        <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />
        <AbsoluteFill style={{ background: "linear-gradient(to bottom, transparent 62%, rgba(0,0,0,.7) 100%)" }} />

        {/* o notch do FocusBrew */}
        <div style={{ position: "absolute", top: 0, left: CX, width: 0, height: 0 }}>
          <div style={{ position: "absolute", top: 0, left: 0, transform: `translateX(-50%) scale(${S})`, transformOrigin: "50% 0" }}>
            {/* anel de destaque na barra parada */}
            <div style={{ position: "absolute", left: 70 - 70 - ping * 40, top: -ping * 18, width: 140 + ping * 80, height: 6 + ping * 36, marginLeft: 0, borderRadius: 12, border: `2px solid ${C.accent}`, opacity: pingOp, transform: "translateX(0)" }} />
            <div style={{ position: "relative", width: w, height: h, borderRadius: `0 0 ${rad}px ${rad}px`, background: shellBg, overflow: "hidden", boxShadow: `0 ${h * 0.15}px ${h * 0.35}px -6px rgba(0,0,0,.65)` }}>
              {/* contorno de destaque do painel aberto (sem a borda de cima) */}
              <div style={{ position: "absolute", inset: 0, border: `1px solid ${C.accent}b3`, borderTop: "none", borderRadius: "inherit", opacity: outline, pointerEvents: "none" }} />
              {/* caixa: contagem + tarefa */}
              <div style={{ position: "absolute", left: 0, top: 0, width: 320, height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", boxSizing: "border-box", opacity: boxOp, fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: C.text }}>
                  <ClockIcon /> {mmss(remainingAt(frame))}
                </span>
                <span style={{ color: C.muted, fontSize: 12, maxWidth: "58%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Escrever testes do carrinho</span>
              </div>
              <div style={{ position: "absolute", left: "50%", top: 0, marginLeft: -280, width: 560, height: 380, opacity: panelOp }}><Panel frame={frame} /></div>
              <div style={{ position: "absolute", left: "50%", top: 0, marginLeft: -280, width: 560, height: 380, opacity: noteOp }}><Note frame={frame} /></div>
              {/* linha de progresso */}
              <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, opacity: lineOp, overflow: "visible" }} fill="none">
                <path d={uPath} stroke={C.accent} strokeOpacity={0.28} strokeWidth={2} strokeLinecap="round" />
                <path d={uPath} stroke={C.accent} strokeWidth={2.2} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frac} style={{ filter: `drop-shadow(0 0 3px ${C.accent})` }} />
              </svg>
            </div>
          </div>
        </div>

        {running && t < 10.9 && (
          <div style={{ position: "absolute", right: 150, top: 190, fontSize: 30, color: "#d6d6dc", fontWeight: 600, opacity: win(frame, 8.9, 10.5, 0.3, 0.3), background: "rgba(0,0,0,.55)", padding: "8px 18px", borderRadius: 14, border: "1px solid #2e2e34" }}>⏩ tempo acelerado</div>
        )}
        <div style={{ opacity: curOp }}><Cursor x={cur.x} y={cur.y} press={curPress} /></div>
      </AbsoluteFill>

      {/* gancho */}
      <Caption from={0.15} to={1.5} style={{ top: 330, fontSize: 150, letterSpacing: -5 }}>Pra onde foi<br /><Hi>o seu dia?</Hi></Caption>

      {/* legendas, casadas com a narração */}
      <Caption from={1.6} to={4.55} style={BOTTOM}>Uma barrinha<br /><Hi>no topo da tela.</Hi></Caption>
      <Caption from={4.68} to={7.45} style={BOTTOM}>Planeje o dia.<br /><Hi>Cada tarefa, o seu tempo.</Hi></Caption>
      <Caption from={7.55} to={8.2} style={{ ...BOTTOM, bottom: 60, fontSize: 110 }}>Dê <Hi>play.</Hi></Caption>
      <Caption from={8.3} to={10.8} style={BOTTOM}>E uma linha<br /><Hi>se enche em volta.</Hi></Caption>
      <Caption from={10.95} to={14.4} style={BOTTOM}>PRs e issues do GitHub<br /><Hi color={C.green}>viram tarefa.</Hi></Caption>
      <Caption from={14.5} to={15.5} style={{ ...BOTTOM, bottom: 70, fontSize: 104 }}>Bateu uma <Hi>ideia?</Hi></Caption>
      <Caption from={17.2} to={18.2} style={{ ...BOTTOM, bottom: 50 }}>Anote. <Hi>Desenhe.</Hi></Caption>
      <Caption from={18.2} to={20.5} style={BOTTOM}>A grade mostra<br /><Hi>o seu ritmo.</Hi></Caption>

      {/* atalho global */}
      <AbsoluteFill style={{ opacity: keys, alignItems: "center", justifyContent: "flex-end", paddingBottom: 90 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <Key label="Ctrl" at={15.62} />
          <span style={{ fontSize: 56, color: C.muted, fontWeight: 600, opacity: P(frame, 16.1, 16.3) }}>+</span>
          <Key label="Alt" at={16.15} />
          <span style={{ fontSize: 56, color: C.muted, fontWeight: 600, opacity: P(frame, 16.67, 16.87) }}>+</span>
          <Key label="N" at={16.72} />
        </div>
        <div style={{ marginTop: 22, fontSize: 40, color: "#b8b8c0", fontWeight: 600, textShadow: "0 4px 24px rgba(0,0,0,.9)" }}>nota rápida, de qualquer tela</div>
      </AbsoluteFill>

      {/* grátis, código aberto, local */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: chipsA }}>
        <div style={{ display: "grid", gap: 26, justifyItems: "center" }}>
          <Chip at={20.7}>Grátis</Chip>
          <Chip at={21.3}>Código aberto · MIT</Chip>
          <Chip at={22.25}>Tudo fica no seu PC</Chip>
        </div>
      </AbsoluteFill>

      {/* CTA */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: cta, transform: `translateY(${(1 - cta) * 30}px)` }}>
        <div style={{ position: "absolute", top: 210, display: "flex", alignItems: "center", gap: 30 }}>
          <Logo size={150} />
          <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: -6 }}>FocusBrew</div>
        </div>
        <div style={{ position: "absolute", top: 440, fontSize: 42, color: C.muted }}>O dia do dev, sempre na frente.</div>
        <div style={{ position: "absolute", left: 640, top: 690, width: 640, height: 96, borderRadius: 22, background: dl > 0.01 ? "#26262a" : C.accent, border: dl > 0.01 ? `1px solid #34343a` : "none", boxShadow: `0 0 ${glow}px -8px ${C.accent}cc`, transform: `scale(${1 - btnClick * 0.04})`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 650, color: "#fff" }}>
          {dl <= 0.01 ? "▦  Baixar para Windows" : (
            <>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${dl * 100}%`, background: C.accent, opacity: 0.92 }} />
              <span style={{ position: "relative", fontSize: 27 }}>{dl < 1 ? `Baixando focusbrew_0.4.1_x64-setup.exe  ${Math.round(dl * 100)}%` : "✓  Pronto — 2,7 MB"}</span>
            </>
          )}
        </div>
        <div style={{ position: "absolute", top: 830, fontSize: 30, color: C.muted, fontFamily: MONO }}>github.com/sthevan027/focusbrew</div>
      </AbsoluteFill>
      <div style={{ opacity: cta2Op * (1 - P(frame, 26.5, 26.9)) }}><Cursor x={cta2.x} y={cta2.y} press={btnClick} /></div>

      <Audio src={staticFile("narracao.mp3")} volume={1} />
      <Audio src={staticFile("trilha.mp3")} volume={(f) => interpolate(f, [0, 20, s(1.2), s(24.2), s(25.2), s(26.2), s(27.2)], [0, 0.2, 0.13, 0.13, 0.26, 0.26, 0], clamp)} />
      <span style={{ display: "none" }}>{fps}</span>
    </AbsoluteFill>
  );
};
