import { useState } from "react";
import type { StateSnapshot } from "../lib/types";
import { syncedAtLabel } from "../lib/agenda";
import { fire, googleConnect, googleDisconnect } from "../lib/tauri";

export default function GoogleCalendarPanel({ state }: { state: StateSnapshot }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = state.config.google_connected;
  const syncedAt = syncedAtLabel(state.google_last_sync_ms);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await googleConnect();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!connected) {
    return (
      <section className="github-panel">
        <p>
          Conecte sua Google Agenda pra puxar os eventos do dia como tarefas e mandar as tarefas do FocusBrew pra
          agenda. Abre o navegador pra você autorizar.
        </p>
        <button onClick={connect} disabled={busy}>
          {busy ? "Aguardando o navegador..." : "Conectar com o Google"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="github-panel">
      <div className="github-header">
        <span>Conectado à Google Agenda</span>
        <button className="secondary" onClick={() => fire(googleDisconnect())}>
          Desconectar
        </button>
      </div>
      {syncedAt && <p className="hint">Sincronizado às {syncedAt}</p>}
      {state.google_error && <p className="error">{state.google_error}</p>}
    </section>
  );
}
