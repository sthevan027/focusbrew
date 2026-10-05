import { useEffect, useState } from "react";
import { clampMinutes, MAX_MINUTES, MIN_MINUTES } from "../lib/minutes";
import Row from "./Row";
import type { SectionProps } from "./Row";
import Switch from "./Switch";

export default function FocusSection({ config, set }: SectionProps) {
  const [draft, setDraft] = useState(String(config.default_minutes));

  useEffect(() => {
    setDraft(String(config.default_minutes));
  }, [config.default_minutes]);

  const commit = () => {
    if (draft.trim() === "") {
      setDraft(String(config.default_minutes));
      return;
    }
    const minutes = clampMinutes(Number(draft));
    setDraft(String(minutes));
    if (minutes !== config.default_minutes) set({ default_minutes: minutes });
  };

  return (
    <>
      <p className="lead">Como uma tarefa nova nasce e o que acontece quando o tempo dela acaba.</p>
      <div className="group">
        <Row title="Minutos de uma tarefa nova" hint={`De ${MIN_MINUTES} a ${MAX_MINUTES} minutos.`}>
          <input
            type="number"
            className="minutes-input"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={5}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </Row>
        <Row title="Avisar quando o bloco terminar" hint="Uma notificação do Windows com o nome da tarefa.">
          <Switch
            label="Avisar quando o bloco terminar"
            checked={config.notify_on_finish}
            onChange={(notify_on_finish) => set({ notify_on_finish })}
          />
        </Row>
      </div>
    </>
  );
}
