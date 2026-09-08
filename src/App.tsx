import { useEffect, useState } from "react";
import type { StateSnapshot } from "./lib/types";
import { getState, onStateChanged } from "./lib/tauri";
import Dashboard from "./components/Dashboard";
import TaskBoard from "./components/TaskBoard";
import GithubPanel from "./components/GithubPanel";
import Settings from "./components/Settings";
import "./App.css";

type Tab = "dashboard" | "tasks" | "github" | "settings";

function App() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) {
    return (
      <main className="container loading">
        <p>Carregando...</p>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="app-header">
        <h1>focusbrew</h1>
        <nav className="tabs">
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>
            Painel
          </button>
          <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>
            Tarefas {state.tasks.filter((t) => !t.done).length > 0 && `(${state.tasks.filter((t) => !t.done).length})`}
          </button>
          <button className={tab === "github" ? "active" : ""} onClick={() => setTab("github")}>
            GitHub
          </button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            Config
          </button>
        </nav>
      </header>

      {tab === "dashboard" && <Dashboard state={state} />}
      {tab === "tasks" && <TaskBoard tasks={state.tasks} />}
      {tab === "github" && <GithubPanel state={state} />}
      {tab === "settings" && <Settings config={state.config} />}
    </main>
  );
}

export default App;
