import Row from "./Row";
import { statusHint } from "./updateStatus";
import type { UseUpdateStatus } from "./useUpdateStatus";

export default function UpdateRow({ update }: { update: UseUpdateStatus }) {
  const { state, checkNow, install } = update;
  const busy = state.checking || state.installing;
  const label = state.installing
    ? "Atualizando..."
    : state.checking
      ? "Verificando..."
      : state.availableVersion
        ? "Atualizar agora"
        : "Verificar agora";
  const onClick = state.availableVersion ? install : checkNow;
  return (
    <>
      <Row title="Atualizações" hint={statusHint(state)}>
        <button
          type="button"
          className={state.availableVersion ? "update-button available" : "update-button"}
          onClick={onClick}
          disabled={busy}
        >
          {label}
        </button>
      </Row>
      {state.error && <p className="error">{state.error}</p>}
    </>
  );
}
