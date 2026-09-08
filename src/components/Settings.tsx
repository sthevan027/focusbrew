import { useState } from "react";
import type { AppConfig } from "../lib/types";
import { updateSettings } from "../lib/tauri";

export default function Settings({ config }: { config: AppConfig }) {
  const [draft, setDraft] = useState(config);
  const [saved, setSaved] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <form className="settings" onSubmit={save}>
      <fieldset>
        <legend>Detecção</legend>
        <label>
          Processos monitorados (separados por vírgula)
          <input
            value={draft.monitored_processes.join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                monitored_processes: e.currentTarget.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
          />
        </label>
        <label>
          Intervalo de checagem (segundos)
          <input
            type="number"
            min={1}
            value={draft.poll_interval_secs}
            onChange={(e) => setDraft({ ...draft, poll_interval_secs: Number(e.currentTarget.value) })}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Modo foco</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.focus_auto_enable}
            onChange={(e) => setDraft({ ...draft, focus_auto_enable: e.currentTarget.checked })}
          />
          Ativar automaticamente ao detectar atividade
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.block_apps_enabled}
            onChange={(e) => setDraft({ ...draft, block_apps_enabled: e.currentTarget.checked })}
          />
          Bloquear apps de distração
        </label>
        <label>
          Apps bloqueados (separados por vírgula)
          <input
            value={draft.blocked_apps.join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                blocked_apps: e.currentTarget.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.dnd_enabled}
            onChange={(e) => setDraft({ ...draft, dnd_enabled: e.currentTarget.checked })}
          />
          Ativar Não Perturbe do sistema
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.theme_switch_enabled}
            onChange={(e) => setDraft({ ...draft, theme_switch_enabled: e.currentTarget.checked })}
          />
          Trocar tema do sistema pra escuro
        </label>
      </fieldset>

      <fieldset>
        <legend>Timer de café</legend>
        <label>
          Foco (minutos)
          <input
            type="number"
            min={1}
            value={draft.timer.focus_minutes}
            onChange={(e) =>
              setDraft({ ...draft, timer: { ...draft.timer, focus_minutes: Number(e.currentTarget.value) } })
            }
          />
        </label>
        <label>
          Pausa (minutos)
          <input
            type="number"
            min={1}
            value={draft.timer.break_minutes}
            onChange={(e) =>
              setDraft({ ...draft, timer: { ...draft.timer, break_minutes: Number(e.currentTarget.value) } })
            }
          />
        </label>
      </fieldset>

      <button type="submit">{saved ? "Salvo ✓" : "Salvar configurações"}</button>
    </form>
  );
}
