import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { MonitorChoice } from "../lib/types";
import { listMonitors, setLaunchAtLogin, setShortcut } from "../lib/tauri";
import { comboFromKeys, prettyShortcut } from "../lib/shortcut";
import Row from "./Row";
import type { SectionProps } from "./Row";
import Switch from "./Switch";
import UpdateRow from "./UpdateRow";
import type { UseUpdateStatus } from "./useUpdateStatus";

export default function GeneralSection({
  config,
  set,
  shortcutWarning,
  update,
}: SectionProps & { shortcutWarning: string | null; update: UseUpdateStatus }) {
  const [version, setVersion] = useState("");
  const [monitors, setMonitors] = useState<MonitorChoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then((v) => setVersion(String(v)))
      .catch(() => setVersion(""));
    listMonitors()
      .then(setMonitors)
      .catch(() => setMonitors([]));
  }, []);

  const saveShortcut = (which: "toggle" | "panel" | "note", text: string) => {
    setError(null);
    setShortcut(which, text).catch((e) => setError(String(e)));
  };

  const toggleLaunch = (enabled: boolean) => {
    setError(null);
    setLaunchAtLogin(enabled).catch((e) => setError(String(e)));
  };

  return (
    <>
      <div className="group">
        <Row title="Mostrar o widget" hint="A barra no topo da tela. Também dá pra alternar pelo ícone da bandeja.">
          <Switch
            label="Mostrar o widget"
            checked={config.widget_visible}
            onChange={(widget_visible) => set({ widget_visible })}
          />
        </Row>
        {monitors.length > 1 && (
          <Row title="Monitor do widget" hint="Se ele for desconectado, o widget volta pro principal.">
            <select
              className="select"
              aria-label="Monitor do widget"
              value={config.monitor ?? ""}
              onChange={(e) => set({ monitor: e.currentTarget.value || null })}
            >
              <option value="">Principal</option>
              {monitors.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.label}
                </option>
              ))}
            </select>
          </Row>
        )}
        <Row title="Iniciar com o Windows" hint="O focusbrew abre sozinho quando você entra no Windows.">
          <Switch label="Iniciar com o Windows" checked={config.launch_at_login} onChange={toggleLaunch} />
        </Row>
      </div>

      <div className="group">
        <Row title="Pausar / iniciar" hint="Pausa ou retoma o bloco; parado, inicia a primeira tarefa de hoje.">
          <ShortcutInput
            label="Atalho de pausar ou iniciar"
            value={config.shortcut_toggle}
            onChange={(text) => saveShortcut("toggle", text)}
          />
        </Row>
        <Row title="Abrir o painel" hint="Abre o painel fixado (Esc fecha). Bom pra planejar sem o mouse.">
          <ShortcutInput
            label="Atalho de abrir o painel"
            value={config.shortcut_panel}
            onChange={(text) => saveShortcut("panel", text)}
          />
        </Row>
        <Row title="Nota rápida" hint="Abre uma nota nova em qualquer lugar. Com uma nota aberta, só traz ela pra frente.">
          <ShortcutInput
            label="Atalho de nota rápida"
            value={config.shortcut_note}
            onChange={(text) => saveShortcut("note", text)}
          />
        </Row>
      </div>
      {(error ?? shortcutWarning) && <p className="error">{error ?? shortcutWarning}</p>}

      <div className="group">
        <Row title="Versão">
          <span className="version">{version ? `focusbrew ${version}` : "focusbrew"}</span>
        </Row>
        <UpdateRow update={update} />
      </div>
    </>
  );
}

/** Click, then press the combination. Esc gives up. */
function ShortcutInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [recording, setRecording] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    if (e.code === "Escape") {
      setRecording(false);
      return;
    }
    const combo = comboFromKeys(e);
    if (!combo) return;
    setRecording(false);
    if (combo !== value) onChange(combo);
  };

  return (
    <button
      type="button"
      className={recording ? "shortcut recording" : "shortcut"}
      aria-label={label}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={onKeyDown}
    >
      {recording ? "Aperte a combinação…" : prettyShortcut(value)}
    </button>
  );
}
