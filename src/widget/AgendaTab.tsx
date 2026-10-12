import { useEffect, useState } from "react";
import { googleImportEvent, googleListDayEvents } from "../lib/tauri";
import { isImported, syncedAtLabel } from "../lib/agenda";
import type { CalendarEventView, StateSnapshot } from "../lib/types";

export function AgendaTab({ state, day }: { state: StateSnapshot; day: string }) {
  const [events, setEvents] = useState<CalendarEventView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    googleListDayEvents(day)
      .then((list) => {
        setEvents(list);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [day]);

  const syncedAt = syncedAtLabel(state.google_last_sync_ms);

  return (
    <section className="agenda-tab">
      {error && <p className="agenda-error">{error}</p>}
      {state.google_error && <p className="agenda-error">{state.google_error}</p>}
      {!error && events.length === 0 && <p className="empty">Nenhum evento neste dia.</p>}
      <ul className="agenda-list">
        {events.map((event) => {
          const imported = isImported(event.id, state.tasks);
          return (
            <li key={event.id}>
              <label>
                <input
                  type="checkbox"
                  checked={imported}
                  disabled={imported}
                  onChange={() => googleImportEvent(event, day)}
                />
                {event.title}
              </label>
            </li>
          );
        })}
      </ul>
      {syncedAt && <p className="hint">Sincronizado às {syncedAt}</p>}
    </section>
  );
}
