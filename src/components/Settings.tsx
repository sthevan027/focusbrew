import { useEffect, useState } from "react";
import type { AppConfig } from "../lib/types";
import { getAccentColor, updateSettings } from "../lib/tauri";

const RING_PRESETS = [
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // teal
];

function RingColorPicker({
  value,
  systemColor,
  onChange,
}: {
  value: string | null;
  systemColor: string | null;
  onChange: (value: string | null) => void;
}) {
  const resolvedSystemColor = systemColor ?? "#3b82f6";
  const isCustomSelected = value !== null && !RING_PRESETS.includes(value);

  return (
    <div className="ring-picker">
      <div className="ring-swatches">
        <button
          type="button"
          className={`ring-swatch ring-swatch-auto ${value === null ? "selected" : ""}`}
          style={{ background: resolvedSystemColor }}
          onClick={() => onChange(null)}
          title={systemColor ? `Automático (${systemColor})` : "Automático — cor do sistema indisponível"}
        >
          A
        </button>
        {RING_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={`ring-swatch ${value === c ? "selected" : ""}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        <label
          className={`ring-swatch ring-swatch-custom ${isCustomSelected ? "selected" : ""}`}
          style={isCustomSelected ? { background: value } : undefined}
          title="Cor personalizada"
        >
          {!isCustomSelected && "+"}
          <input
            type="color"
            value={isCustomSelected ? value : resolvedSystemColor}
            onChange={(e) => onChange(e.currentTarget.value)}
          />
        </label>
      </div>
      <span className="ring-picker-hint">
        {value === null
          ? systemColor
            ? `Seguindo o sistema (${systemColor})`
            : "Seguindo o sistema — não detectado, usando azul"
          : `Cor fixa (${value})`}
      </span>
    </div>
  );
}

interface Suggestion {
  label: string;
  value: string;
}

const MONITORED_SUGGESTIONS: Suggestion[] = [
  { label: "VS Code", value: "Code.exe" },
  { label: "Cursor", value: "Cursor.exe" },
  { label: "Claude Code", value: "claude" },
  { label: "Codex CLI", value: "codex" },
  { label: "Windows Terminal", value: "WindowsTerminal.exe" },
  { label: "PowerShell 7", value: "pwsh.exe" },
];

const BLOCKED_SUGGESTIONS: Suggestion[] = [
  { label: "Discord", value: "Discord.exe" },
  { label: "Steam", value: "Steam.exe" },
  { label: "Spotify", value: "Spotify.exe" },
  { label: "WhatsApp Desktop", value: "WhatsApp.exe" },
  { label: "Telegram", value: "Telegram.exe" },
  { label: "Epic Games Launcher", value: "EpicGamesLauncher.exe" },
];

function ChipListEditor({
  label,
  items,
  onChange,
  suggestions,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  suggestions: Suggestion[];
}) {
  const [draft, setDraft] = useState("");

  const add = (value: string) => {
    const v = value.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
  };

  const remove = (value: string) => onChange(items.filter((i) => i !== value));

  const availableSuggestions = suggestions.filter((s) => !items.includes(s.value));

  return (
    <div className="chip-editor">
      <span className="chip-editor-label">{label}</span>
      <div className="chip-list">
        {items.length === 0 && <span className="chip-empty">Nenhum</span>}
        {items.map((item) => (
          <span className="chip" key={item}>
            {item}
            <button
              type="button"
              className="chip-remove"
              onClick={() => remove(item)}
              aria-label={`Remover ${item}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="chip-add-row">
        <input
          value={draft}
          placeholder="nome-do-processo.exe"
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
              setDraft("");
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            add(draft);
            setDraft("");
          }}
        >
          Adicionar
        </button>
      </div>
      {availableSuggestions.length > 0 && (
        <div className="chip-suggestions">
          {availableSuggestions.map((s) => (
            <button
              type="button"
              key={s.value}
              className="chip-suggestion"
              onClick={() => add(s.value)}
            >
              + {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Settings({ config }: { config: AppConfig }) {
  const [draft, setDraft] = useState(config);
  const [saved, setSaved] = useState(false);
  const [systemColor, setSystemColor] = useState<string | null>(null);

  useEffect(() => {
    getAccentColor()
      .then(setSystemColor)
      .catch(() => setSystemColor(null));
  }, []);

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
        <ChipListEditor
          label="Processos monitorados"
          items={draft.monitored_processes}
          onChange={(monitored_processes) => setDraft({ ...draft, monitored_processes })}
          suggestions={MONITORED_SUGGESTIONS}
        />
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
        <ChipListEditor
          label="Apps bloqueados"
          items={draft.blocked_apps}
          onChange={(blocked_apps) => setDraft({ ...draft, blocked_apps })}
          suggestions={BLOCKED_SUGGESTIONS}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.dnd_enabled}
            onChange={(e) => setDraft({ ...draft, dnd_enabled: e.currentTarget.checked })}
          />
          Ativar Não Perturbe do sistema
        </label>
      </fieldset>

      <fieldset>
        <legend>Widget</legend>
        <span className="chip-editor-label">Cor do anel de progresso</span>
        <RingColorPicker
          value={draft.ring_color}
          systemColor={systemColor}
          onChange={(ring_color) => setDraft({ ...draft, ring_color })}
        />
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
