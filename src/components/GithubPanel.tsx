import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { GithubItem, StateSnapshot } from "../lib/types";
import { dayLabel } from "../lib/day";
import { linkedTask } from "../lib/github";
import {
  clearGithubToken,
  connectGithubWithGh,
  fire,
  githubGhAvailable,
  importGithubItemAsTask,
  refreshGithub,
  saveGithubToken,
} from "../lib/tauri";

export default function GithubPanel({ state }: { state: StateSnapshot }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghAvailable, setGhAvailable] = useState<boolean | null>(null);
  const connected = Boolean(state.config.github_login);

  useEffect(() => {
    if (connected) return;
    githubGhAvailable()
      .then(setGhAvailable)
      .catch(() => setGhAvailable(false));
  }, [connected]);

  const connectWithGh = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectGithubWithGh();
      await refreshGithub();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

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

  if (!connected) {
    return (
      <section className="github-panel">
        {ghAvailable ? (
          <>
            <p>Achei o GitHub CLI logado nesta máquina. Conecte com ele, sem colar token.</p>
            <button onClick={connectWithGh} disabled={busy}>
              {busy ? "Conectando..." : "Conectar com o GitHub CLI"}
            </button>
          </>
        ) : (
          <p>
            Pra conectar sem token, instale o <a href="https://cli.github.com" target="_blank" rel="noreferrer">GitHub CLI</a>{" "}
            e rode <code>gh auth login</code> num terminal
            {ghAvailable === false ? "." : " (verificando...)"}
          </p>
        )}

        <p className="hint">Ou conecte com um Personal Access Token (escopo <code>repo</code>):</p>
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
          {state.github_source && (
            <span className="github-source"> · via {state.github_source === "gh" ? "GitHub CLI" : "token"}</span>
          )}
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
          <GithubRow key={`${item.repository}-${item.number}`} item={item} state={state} />
        ))}
      </ul>

      {state.github_items.length === 0 && !state.github_error && (
        <p className="empty">Nada por aqui — sem PRs/issues abertos envolvendo você.</p>
      )}
    </section>
  );
}

function GithubRow({ item, state }: { item: GithubItem; state: StateSnapshot }) {
  const task = linkedTask(item, state.tasks);
  const planned = task && !task.done ? (task.day < state.today ? state.today : task.day) : null;
  return (
    <li className="github-row">
      <a
        href={item.html_url}
        onClick={(e) => {
          e.preventDefault();
          if (item.html_url.startsWith("https://")) fire(openUrl(item.html_url));
        }}
      >
        {item.is_pull_request ? "PR" : "Issue"} #{item.number} — {item.title}
      </a>
      <div className="github-meta">
        <span>{item.repository}</span>
        {task ? (
          <span className="github-linked">
            {task.done ? "✓ tarefa feita" : `já é tarefa · ${dayLabel(planned!, state.today).toLowerCase()}`}
          </span>
        ) : (
          <button onClick={() => fire(importGithubItemAsTask(item))}>+ Tarefa</button>
        )}
      </div>
    </li>
  );
}
