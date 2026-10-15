export type BoxTab = "task" | "media";

/** A tarefa é sempre a aba padrão quando há uma ativa — música é o complemento. */
export function defaultTab(hasTask: boolean, hasMedia: boolean): BoxTab {
  if (hasTask) return "task";
  return hasMedia ? "media" : "task";
}

/**
 * Ctrl+Scroll alterna entre as duas abas quando ambas as fontes estão
 * ativas; com só uma (ou nenhuma), o scroll não tem pra onde ir e a aba
 * atual se mantém. A direção do scroll não importa, só que ele aconteceu —
 * só existem duas abas pra alternar entre.
 */
export function nextTab(current: BoxTab, hasTask: boolean, hasMedia: boolean, deltaY: number): BoxTab {
  if (deltaY === 0) return current;
  if (!(hasTask && hasMedia)) return current;
  return current === "task" ? "media" : "task";
}
