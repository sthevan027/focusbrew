import { useEffect, useState } from "react";
import type { ProjectTotal, StateSnapshot } from "../lib/types";
import { projectTotals } from "../lib/tauri";
import { formatDuration } from "../lib/activity";

/** Time per project from the whole history; refreshed when blocks end. */
export default function ProjectsSection({ state }: { state: StateSnapshot }) {
  const [totals, setTotals] = useState<ProjectTotal[] | null>(null);
  const blocks = state.sessions.length;
  const lastEnded = state.sessions[state.sessions.length - 1]?.ended_ms ?? 0;

  useEffect(() => {
    projectTotals()
      .then(setTotals)
      .catch(() => setTotals([]));
  }, [blocks, lastEnded]);

  return (
    <>
      <p className="lead">
        Tempo de foco por projeto. Pra dar um projeto a uma tarefa, termine o título com <code>#projeto</code> (ao
        criar, ou com duplo clique no título). Tarefas do GitHub usam o nome do repositório.
      </p>
      {totals === null ? (
        <p className="empty">Carregando...</p>
      ) : totals.length === 0 ? (
        <p className="empty">Nenhum bloco registrado ainda.</p>
      ) : (
        <table className="projects">
          <thead>
            <tr>
              <th>Projeto</th>
              <th>Hoje</th>
              <th>7 dias</th>
              <th>30 dias</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.project ?? ""}>
                <td className={t.project ? "" : "muted"}>{t.project ?? "Sem projeto"}</td>
                <td>{t.today ? formatDuration(t.today) : "—"}</td>
                <td>{t.week ? formatDuration(t.week) : "—"}</td>
                <td>{t.month ? formatDuration(t.month) : "—"}</td>
                <td>
                  <strong>{formatDuration(t.total)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
