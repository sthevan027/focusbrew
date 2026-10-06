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
        <Row title="Avisar antes do fim" hint="Uma notificação quando faltar pouco pro bloco acabar.">
          <Choice
            label="Avisar antes do fim"
            value={config.notify_before_end_mins}
            options={[
              [0, "Desligado"],
              [1, "1 min antes"],
              [2, "2 min antes"],
              [5, "5 min antes"],
            ]}
            onChange={(notify_before_end_mins) => set({ notify_before_end_mins })}
          />
        </Row>
      </div>
      <div className="group">
        <Row title="Meta do dia" hint="O cabeçalho do painel mostra o quanto falta; avisa uma vez ao bater.">
          <Choice
            label="Meta do dia"
            value={config.daily_goal_mins}
            options={[[0, "Sem meta"], ...[1, 2, 3, 4, 5, 6, 8].map((h): [number, string] => [h * 60, `${h}h de foco`])]}
            onChange={(daily_goal_mins) => set({ daily_goal_mins })}
          />
        </Row>
        <Row
          title="Lembrete se ficar parado"
          hint="Quando nada está rodando e há tarefas pra hoje. Só das 8h às 20h."
        >
          <Choice
            label="Lembrete se ficar parado"
            value={config.idle_reminder_mins}
            options={[
              [0, "Desligado"],
              [15, "Depois de 15 min"],
              [30, "Depois de 30 min"],
              [60, "Depois de 1h"],
            ]}
            onChange={(idle_reminder_mins) => set({ idle_reminder_mins })}
          />
        </Row>
      </div>
    </>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: [number, string][];
  onChange: (value: number) => void;
}) {
  return (
    <select className="select" aria-label={label} value={value} onChange={(e) => onChange(Number(e.currentTarget.value))}>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}
