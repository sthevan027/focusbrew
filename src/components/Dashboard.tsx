import type { StateSnapshot } from "../lib/types";
import { startCoffeeBreak, stopTimer } from "../lib/tauri";

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function Dashboard({ state }: { state: StateSnapshot }) {
  const statusLabel =
    state.timer.phase === "break"
      ? "Pausa do café ☕"
      : state.focus_mode
      ? "Modo foco ativo 🔒"
      : state.activity === "working"
      ? "Trabalhando 🟢"
      : "Sem atividade";

  return (
    <section className="dashboard">
      <div className={`status-card status-${state.timer.phase === "break" ? "coffee" : state.focus_mode ? "focus" : state.activity}`}>
        <h2>{statusLabel}</h2>
        {state.timer.phase !== "off" && (
          <p className="timer">{formatTime(state.timer.remaining_secs)}</p>
        )}
        <p className="hint">
          Detecção automática via processos monitorados (VS Code, Claude Code, Cursor...).
        </p>
      </div>

      <div className="actions">
        {state.timer.phase === "off" ? (
          <button onClick={() => startCoffeeBreak()}>Iniciar pausa-café ☕</button>
        ) : (
          <button onClick={() => stopTimer()}>Parar timer</button>
        )}
      </div>
    </section>
  );
}
