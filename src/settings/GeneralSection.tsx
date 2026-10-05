import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import Row from "./Row";
import type { SectionProps } from "./Row";
import Switch from "./Switch";

export default function GeneralSection({ config, set }: SectionProps) {
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then((v) => setVersion(String(v)))
      .catch(() => setVersion(""));
  }, []);

  return (
    <div className="group">
      <Row title="Mostrar o widget" hint="A barra no topo da tela. Também dá pra alternar pelo ícone da bandeja.">
        <Switch
          label="Mostrar o widget"
          checked={config.widget_visible}
          onChange={(widget_visible) => set({ widget_visible })}
        />
      </Row>
      <Row title="Versão" hint="Atalho global: Ctrl+Shift+Space pausa/retoma o bloco, ou inicia a primeira tarefa.">
        <span className="version">{version ? `focusbrew ${version}` : "focusbrew"}</span>
      </Row>
    </div>
  );
}
