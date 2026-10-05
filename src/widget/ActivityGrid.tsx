import { buildGrid, cellTitle } from "../lib/activity";

interface Props {
  secsByDay: Record<string, number>;
}

/** The last 4 weeks, Monday first; one square per day, darker = more focus. */
export default function ActivityGrid({ secsByDay }: Props) {
  const cells = buildGrid(secsByDay, new Date());
  return (
    <div className="grid" role="img" aria-label="Atividade dos últimos 28 dias">
      {cells.map((cell, i) =>
        cell ? (
          <span key={cell.date} className={`cell level-${cell.level}`} title={cellTitle(cell)} />
        ) : (
          <span key={`future-${i}`} className="cell future" />
        ),
      )}
    </div>
  );
}
