import { useEffect, useState } from "react";
import type { StateSnapshot } from "./lib/types";
import { getState, onStateChanged } from "./lib/tauri";
import GithubPanel from "./components/GithubPanel";

export default function App() {
  const [state, setState] = useState<StateSnapshot | null>(null);

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
      <h1>focusbrew</h1>
      <GithubPanel state={state} />
    </main>
  );
}
