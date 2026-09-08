import { useState } from "react";
import type { GithubItem, StateSnapshot } from "../lib/types";
import { importGithubItemAsTask, refreshGithub, saveGithubToken, clearGithubToken } from "../lib/tauri";

export default function GithubPanel({ state }: { state: StateSnapshot }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await saveGithubToken(token.trim());
      setToken("");
      await refreshGithub();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!state.config.github_login) {
    return (
      <section className="github-panel">
        <p>
          Conecte um Personal Access Token do GitHub (escopo <code>repo</code>) pra ver seus PRs e
          issues abertos aqui.
        </p>
        <form onSubmit={connect} className="task-form">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            placeholder="ghp_..."
          />
          <button type="submit" disabled={busy}>
            {busy ? "Conectando..." : "Conectar"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="github-panel">
      <div className="github-header">
        <span>
          Conectado como <strong>{state.config.github_login}</strong>
        </span>
        <div>
          <button onClick={() => refreshGithub()}>Atualizar</button>
          <button className="secondary" onClick={() => clearGithubToken()}>
            Desconectar
          </button>
        </div>
      </div>

      {state.github_error && <p className="error">{state.github_error}</p>}

      <ul className="github-list">
        {state.github_items.map((item) => (
          <GithubRow key={`${item.repository}-${item.number}`} item={item} />
        ))}
      </ul>

      {state.github_items.length === 0 && !state.github_error && (
        <p className="empty">Nada por aqui — sem PRs/issues abertos envolvendo você.</p>
      )}
    </section>
  );
}

function GithubRow({ item }: { item: GithubItem }) {
  return (
    <li className="github-row">
      <a href={item.html_url} target="_blank" rel="noreferrer">
        {item.is_pull_request ? "PR" : "Issue"} #{item.number} — {item.title}
      </a>
      <div className="github-meta">
        <span>{item.repository}</span>
        <button onClick={() => importGithubItemAsTask(`${item.repository} #${item.number} — ${item.title}`)}>
          + Tarefa
        </button>
      </div>
    </li>
  );
}
