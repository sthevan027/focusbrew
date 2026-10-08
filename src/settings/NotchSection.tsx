import { useEffect, useState } from "react";
import type { NotchStyle, SideCountStyle, WidgetEdge, WidgetScale } from "../lib/types";
import { ACCENT_PRESETS, normalizeHex } from "./colors";
import Row from "./Row";
import type { SectionProps } from "./Row";
import Switch from "./Switch";

const STYLES: { id: NotchStyle; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "minimal", label: "Minimal" },
];

const SCALES: { id: WidgetScale; label: string }[] = [
  { id: "small", label: "Pequeno" },
  { id: "medium", label: "Médio" },
  { id: "large", label: "Grande" },
];

const EDGES: { id: WidgetEdge; label: string }[] = [
  { id: "top", label: "Topo" },
  { id: "left", label: "Esquerda" },
  { id: "right", label: "Direita" },
];

const SIDE_COUNTS: { id: SideCountStyle; label: string }[] = [
  { id: "stacked", label: "Empilhada" },
  { id: "inline", label: "Numa linha" },
];

/** A little drawing of the notch in each style. */
function Thumb({ style }: { style: NotchStyle }) {
  return (
    <div className="thumb">
      <div className={`thumb-notch ${style}`}>
        {style === "standard" && (
          <>
            <i className="t-clock" />
            <i className="t-title" />
          </>
        )}
        <b className="t-line" />
      </div>
    </div>
  );
}

export default function NotchSection({ config, set }: SectionProps) {
  const [hex, setHex] = useState(config.accent_color);

  useEffect(() => {
    setHex(config.accent_color);
  }, [config.accent_color]);

  const commitHex = () => {
    const valid = normalizeHex(hex);
    if (valid) set({ accent_color: valid });
    else setHex(config.accent_color);
  };

  return (
    <>
      <p className="lead">O que o widget mostra enquanto um bloco roda.</p>

      <div className="cards" role="radiogroup" aria-label="Estilo do notch">
        {STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={config.notch_style === style.id}
            className={config.notch_style === style.id ? "notch-card selected" : "notch-card"}
            onClick={() => set({ notch_style: style.id })}
          >
            <Thumb style={style.id} />
            {style.label}
          </button>
        ))}
      </div>
      <p className="row-hint cards-hint">
        Standard mostra a contagem à esquerda e a tarefa à direita; Minimal mostra só a caixa e a linha.
      </p>

      <div className="group">
        <Row title="Progress timeline" hint="Uma linha em volta do widget que se enche enquanto o bloco roda.">
          <Switch
            label="Progress timeline"
            checked={config.progress_line}
            onChange={(progress_line) => set({ progress_line })}
          />
        </Row>
        <Row title="RGB timeline" hint="Arco-íris animado com brilho suave no lugar da cor de destaque.">
          <Switch label="RGB timeline" checked={config.rgb_line} onChange={(rgb_line) => set({ rgb_line })} />
        </Row>
      </div>

      <div className="group">
        <Row title="Cor de destaque" hint="Botão play, grade Activity e contorno do painel.">
          <div className="swatches">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                role="radio"
                aria-checked={config.accent_color === preset.hex}
                aria-label={preset.name}
                title={preset.name}
                className="swatch"
                style={{ background: preset.hex }}
                onClick={() => set({ accent_color: preset.hex })}
              />
            ))}
            <input
              type="text"
              className="hex"
              aria-label="Cor em hexadecimal"
              value={hex}
              maxLength={7}
              onChange={(e) => setHex(e.currentTarget.value)}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
        </Row>
        <Row title="Tamanho" hint="Da barra, da caixa e do painel.">
          <div className="segmented" role="radiogroup" aria-label="Tamanho do widget">
            {SCALES.map((scale) => (
              <button
                key={scale.id}
                type="button"
                role="radio"
                aria-checked={config.widget_scale === scale.id}
                onClick={() => set({ widget_scale: scale.id })}
              >
                {scale.label}
              </button>
            ))}
          </div>
        </Row>
        <Row title="Posição" hint="Em qual borda da tela o widget fica colado. Nas laterais a barra fica em pé.">
          <div className="segmented" role="radiogroup" aria-label="Posição do widget">
            {EDGES.map((edge) => (
              <button
                key={edge.id}
                type="button"
                role="radio"
                aria-checked={config.widget_edge === edge.id}
                onClick={() => set({ widget_edge: edge.id })}
              >
                {edge.label}
              </button>
            ))}
          </div>
        </Row>
        <Row
          title="Contagem na lateral"
          hint="Só vale na esquerda ou na direita: minutos em cima e segundos embaixo (04 / 56), ou tudo numa linha (04:56)."
        >
          <div className="segmented" role="radiogroup" aria-label="Contagem na lateral">
            {SIDE_COUNTS.map((style) => (
              <button
                key={style.id}
                type="button"
                role="radio"
                aria-checked={config.side_count_style === style.id}
                onClick={() => set({ side_count_style: style.id })}
              >
                {style.label}
              </button>
            ))}
          </div>
        </Row>
      </div>
    </>
  );
}
