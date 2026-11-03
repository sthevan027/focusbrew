import { useState } from "react";
import type { AppConfig } from "../lib/types";
import { setCaptureEnabled } from "../lib/tauri";
import { prettyShortcut } from "../lib/shortcut";
import Row from "./Row";
import Switch from "./Switch";

export default function CaptureSection({ config }: { config: AppConfig }) {
  const [error, setError] = useState<string | null>(null);

  const toggle = (enabled: boolean) => {
    setError(null);
    setCaptureEnabled(enabled).catch((e) => setError(String(e)));
  };

  return (
    <>
      <div className="group">
        <Row
          title="Caixa de captura"
          hint="Uma caixa de texto em qualquer lugar. Fale pelo ditado do Windows (Win+H) ou digite: 'tarefa revisar PR #focusbrew 40 min', 'nota ...' ou 'tempo 40'. Desligada, o atalho não é registrado."
        >
          <Switch label="Caixa de captura" checked={config.capture_enabled} onChange={toggle} />
        </Row>
        <Row title="Atalho" hint="Abre a caixa de captura e põe o cursor nela. Enter confirma, Esc fecha.">
          <span className="version" aria-label="Atalho da caixa de captura">
            {prettyShortcut(config.shortcut_capture)}
          </span>
        </Row>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
