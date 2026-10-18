import { useEffect, useState } from "react";
import type { ActivityConfig } from "../lib/activityReport";
import { getActivityConfig, getActivityServiceStatus, updateActivityConfig } from "../lib/tauri";

const RETENTION_OPTIONS = [30, 90, 180];

export default function ActivitySettings() {
  const [config, setConfig] = useState<ActivityConfig | null>(null);
  const [idle, setIdle] = useState(10);
  const [running, setRunning] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActivityServiceStatus()
      .then(setRunning)
      .catch(() => setRunning(false));
    getActivityConfig()
      .then((c) => {
        setConfig(c);
        setIdle(c.idle_threshold_minutes);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const save = (patch: { idleThresholdMinutes?: number; retentionDays?: number }) => {
    updateActivityConfig(patch)
      .then((c) => {
        setConfig(c);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  };

  return (
    <section className="activity-settings">
      <h2>Rastreamento de atividade</h2>
      <p className="activity-muted">Serviço: {running === null ? "verificando…" : running ? "ativo" : "offline"}</p>
      <label className="activity-setting">
        <span>Considerar ocioso após {idle} min sem uso</span>
        <input
          type="range"
          min={1}
          max={60}
          value={idle}
          disabled={!config}
          onChange={(e) => setIdle(Number(e.target.value))}
          onPointerUp={() => save({ idleThresholdMinutes: idle })}
          onKeyUp={() => save({ idleThresholdMinutes: idle })}
        />
      </label>
      <label className="activity-setting">
        <span>Manter dados por</span>
        <select
          value={config?.retention_days ?? 90}
          disabled={!config}
          onChange={(e) => save({ retentionDays: Number(e.target.value) })}
        >
          {RETENTION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} dias
            </option>
          ))}
        </select>
      </label>
      {error && <p className="activity-warning">{error}</p>}
    </section>
  );
}
