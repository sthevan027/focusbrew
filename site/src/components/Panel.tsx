import { pt } from "../content/pt";

export function Panel() {
  return (
    <section id="painel" className="container section">
      <h2>{pt.panel.title}</h2>
      <p className="muted mt-sm">{pt.panel.subtitle}</p>
      <div className="panel-grid">
        {pt.panel.shots.map((s) => (
          <figure key={s.title} className="card panel-shot">
            <img src={s.img} alt={s.alt} loading="lazy" />
            <figcaption>{s.title}</figcaption>
          </figure>
        ))}
      </div>
      <div className="card activity-highlight">
        <div>
          <h3>{pt.activity.title}</h3>
          <p className="muted small mt-sm">{pt.activity.text}</p>
          <p className="streak-badge mt">
            <span aria-hidden="true">🔥</span> <strong>5 dias</strong> seguidos
          </p>
        </div>
        <img src="media/painel-resumo.png" alt="Grade de atividade do FocusBrew, estilo GitHub, com streak de dias seguidos" loading="lazy" />
      </div>
    </section>
  );
}
