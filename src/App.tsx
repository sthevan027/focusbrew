import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { AppConfig, StateSnapshot } from "./lib/types";
import { getState, onStateChanged, updateSettings } from "./lib/tauri";
import GithubPanel from "./components/GithubPanel";
import FocusSection from "./settings/FocusSection";
import GeneralSection from "./settings/GeneralSection";
import NotchSection from "./settings/NotchSection";
import "./App.css";

type Section = "focus" | "notch" | "general" | "github";

const SECTIONS: { id: Section; label: string; glyph: string; color: string }[] = [
  { id: "focus", label: "Foco", glyph: "⏱", color: "#ff9f0a" },
  { id: "notch", label: "Notch", glyph: "▭", color: "#0a84ff" },
  { id: "general", label: "Geral", glyph: "⚙", color: "#8e8e93" },
  { id: "github", label: "GitHub", glyph: "⌥", color: "#30d158" },
];

export default function App() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [section, setSection] = useState<Section>("focus");

  useEffect(() => {
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) {
    return <div className="settings loading">Carregando...</div>;
  }

  const set = (patch: Partial<AppConfig>) => {
    void updateSettings({ ...state.config, ...patch });
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
        {section === "notch" && <NotchSection config={state.config} set={set} />}
        {section === "general" && <GeneralSection config={state.config} set={set} />}
        {section === "github" && <GithubPanel state={state} />}
      </main>
    </div>
  );
}
