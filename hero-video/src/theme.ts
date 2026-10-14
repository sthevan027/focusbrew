import { Easing, interpolate } from "remotion";

export const FPS = 30;
/** segundos → frames */
export const s = (sec: number) => Math.round(sec * FPS);

/** Tokens reais do app (src/Widget.css) e da landing. */
export const C = {
  bg: "#0b0b0d",
  shell: "#000000",
  row: "#141416",
  btn: "#26262a",
  tab: "#2a2a2d",
  line: "#1c1c1f",
  text: "#f2f2f3",
  soft: "#c9c9ce",
  muted: "#8a8a90",
  dim: "#5a5a60",
  accent: "#0a84ff",
  green: "#30d158",
  orange: "#ff9f0a",
  red: "#ff453a",
};

export const FONT = `"Segoe UI Variable", "Segoe UI", Inter, system-ui, sans-serif`;
export const MONO = `"Cascadia Mono", "Cascadia Code", Consolas, "DejaVu Sans Mono", monospace`;

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.inOut(Easing.cubic);
/** crescer é elástico (como no app), encolher é decidido */
export const grow = Easing.bezier(0.34, 1.32, 0.64, 1);
export const shrink = Easing.bezier(0.32, 0.72, 0, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** progresso 0→1 entre dois instantes (em segundos) */
export const P = (frame: number, a: number, b: number, e: (t: number) => number = ease) =>
  interpolate(frame, [s(a), s(b)], [0, 1], { ...clamp, easing: e });

/** 0→1→0: aparece em `a`, some a partir de `b` */
export const win = (frame: number, a: number, b: number, fin = 0.25, fout = 0.2) =>
  P(frame, a, a + fin) * (1 - P(frame, b, b + fout));
