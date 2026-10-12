import { useEffect, useState } from "react";
import { googleImportEvent, googleListDayEvents } from "../lib/tauri";
import { isImported } from "../lib/agenda";
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

  if (error) return <p className="agenda-error">{error}</p>;

  return (
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
  );
}
