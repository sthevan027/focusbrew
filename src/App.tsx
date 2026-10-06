import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { AppConfig, StateSnapshot } from "./lib/types";
import { fire, getState, onStateChanged, updateSettings } from "./lib/tauri";
import GithubPanel from "./components/GithubPanel";
import FocusSection from "./settings/FocusSection";
import GeneralSection from "./settings/GeneralSection";
import NotchSection from "./settings/NotchSection";
import ProjectsSection from "./settings/ProjectsSection";
import "./App.css";

type Section = "focus" | "projects" | "notch" | "general" | "github";

const SECTIONS: { id: Section; label: string; glyph: string; color: string }[] = [
  { id: "focus", label: "Foco", glyph: "⏱", color: "#ff9f0a" },
  { id: "projects", label: "Projetos", glyph: "#", color: "#bf5af2" },
  { id: "notch", label: "Notch", glyph: "▭", color: "#0a84ff" },
  { id: "general", label: "Geral", glyph: "⚙", color: "#8e8e93" },
  { id: "github", label: "GitHub", glyph: "⌥", color: "#30d158" },
];

export default function App() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [section, setSection] = useState<Section>("focus");
  // The config as last sent. Two controls changed before the backend answers
  // must both land: each patch goes on top of this, not of the last render.
  const sent = useRef<AppConfig | null>(null);
  const pending = useRef(0);

  useEffect(() => {
    const receive = (snapshot: StateSnapshot) => {
      // An answer to an older send must not roll back a newer one in flight.
      if (pending.current === 0) sent.current = snapshot.config;
      setState(snapshot);
    };
    getState().then(receive);
    const unlisten = onStateChanged(receive);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) {
    return <div className="settings loading">Carregando...</div>;
  }

  const set = (patch: Partial<AppConfig>) => {
    const next = { ...(sent.current ?? state.config), ...patch };
    sent.current = next;
    pending.current++;
    fire(updateSettings(next).finally(() => pending.current--));
  };
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="settings" style={{ "--accent": state.config.accent_color } as CSSProperties}>
      <nav className="sidebar" aria-label="Configurações">
        <div className="brand">focusbrew</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === section ? "nav-item active" : "nav-item"}
            onClick={() => setSection(s.id)}
          >
            <span className="nav-glyph" style={{ background: s.color }}>
              {s.glyph}
            </span>
            {s.label}
          </button>
        ))}
      </nav>
      <main className="content">
        <h1>{current.label}</h1>
        {section === "focus" && <FocusSection config={state.config} set={set} />}
        {section === "projects" && <ProjectsSection state={state} />}
        {section === "notch" && <NotchSection config={state.config} set={set} />}
        {section === "general" && (
          <GeneralSection config={state.config} set={set} shortcutWarning={state.shortcut_warning} />
        )}
        {section === "github" && <GithubPanel state={state} />}
      </main>
    </div>
  );
}
