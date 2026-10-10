# Auto-update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** focusbrew checa sozinho, ao abrir, se existe uma versão nova publicada no GitHub Releases, mostra o status ("Verificado às HH:MM") na aba Geral das configurações, e baixa/instala/reinicia com um clique quando o usuário quiser.

**Architecture:** `tauri-plugin-updater` + `tauri-plugin-process` oficiais, chamados direto do frontend via `@tauri-apps/plugin-updater`/`@tauri-apps/plugin-process` (sem comando Rust customizado — a janela `main`, mesmo oculta, já carrega o webview no boot, então o `useEffect` de checagem silenciosa roda no mesmo instante em que o app abre). Estado de checagem (checando/instalando/última checagem/versão disponível/erro) vive só em memória do React, via um reducer puro testável separado da chamada de IO.

**Tech Stack:** Tauri v2 (Rust 1.90+), React 19, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-09-auto-update-design.md](../specs/2026-10-09-auto-update-design.md)

## Global Constraints

- Endpoint fixo: `https://github.com/sthevan027/focusbrew/releases/latest/download/latest.json` (nunca muda de release pra release).
- Chave privada do updater fica fora do repo, em variável de ambiente (`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`); só a pública entra no `tauri.conf.json`.
- Nenhuma infraestrutura nova — release continua manual, só ganha um arquivo a mais (`latest.json`) no upload.
- A checagem automática ao abrir é silenciosa: uma falha aí nunca aparece pro usuário nem atualiza "Verificado às".
- Requer Rust 1.90+ (exigência do `tauri-plugin-updater` v2).

## Review Focus

- Clique manual em "Verificar agora" sem internet: ao contrário da checagem silenciosa, essa mostra erro — um reviewer apressado pode copiar o silêncio da automática para as duas.
- Duplo clique em "Atualizar agora": o botão tem que desabilitar assim que `installing` vira `true`, ou dispara dois `downloadAndInstall` em paralelo.
- Uma checagem que antes encontrou versão nova e agora (checagem seguinte) não encontra mais precisa limpar `availableVersion`, não deixar a versão velha "grudada".
- `err` lançado pelo plugin pode não ser uma `Error` de verdade (rejeição com string, objeto, `undefined`) — `String(err)` tem que produzir algo exibível em todos os casos, não `"[object Object]"` silencioso sem explicação.
- A primeira versão que leva esse recurso (v0.4.1) não consegue se autoverificar sozinha: só existe um update real pra achar a partir da versão seguinte. Isso não é um bug a esconder — é uma limitação de bootstrap que o plano deixa documentada, não testada.

---

## File Plan

- Modify: `src-tauri/Cargo.toml` — novas deps `tauri-plugin-updater`, `tauri-plugin-process`.
- Modify: `package.json` — novas deps `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`.
- Modify: `src-tauri/tauri.conf.json` — `bundle.createUpdaterArtifacts`, `plugins.updater`.
- Modify: `src-tauri/capabilities/default.json` — permissões `updater:default`, `process:default`.
- Modify: `src-tauri/src/lib.rs` — registra os dois plugins no builder.
- Create: `src/settings/updateStatus.ts` — reducer puro + `formatCheckedAt` + `statusHint`.
- Create: `src/settings/updateStatus.test.ts`.
- Create: `src/settings/useUpdateStatus.ts` — hook que liga o reducer às chamadas reais do plugin.
- Create: `src/settings/UpdateRow.tsx` — linha de UI (puro, recebe o resultado do hook por prop).
- Create: `src/settings/UpdateRow.test.tsx`.
- Modify: `src/settings/GeneralSection.tsx` — usa `UpdateRow` no lugar do bloco "Versão" atual.
- Modify: `src/App.tsx` — chama `useUpdateStatus()` e passa o resultado pra `GeneralSection`.
- Modify: `README.md` (seção de dev, se existir, senão um novo tópico curto) — como gerar/usar a chave de assinatura e subir o `latest.json` numa release.

---

### Task 1: Gerar a chave de assinatura e configurar o bundle

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Produces: `plugins.updater.pubkey` e `plugins.updater.endpoints` em `tauri.conf.json`, consumidos pelo plugin registrado na Task 2.

- [ ] **Step 1: Gerar o par de chaves**

Rodar (fora do repo, numa pasta pessoal, nunca dentro de `D:\Projetos\focusbrew`):

```bash
bun run tauri signer generate -w "$HOME/.tauri/focusbrew-updater.key"
```

Expected: imprime a chave pública no terminal (começa com algo como
`dW50cnVzdGVkIGNvbW1lbnQ6...`) e grava a privada em
`~/.tauri/focusbrew-updater.key` (+ `.pub`). Copiar o conteúdo impresso da
pública — vai pro Step 3. A privada nunca é commitada nem colada em lugar
nenhum do repo.

- [ ] **Step 2: Adicionar as dependências**

Em `src-tauri/Cargo.toml`, dentro de `[dependencies]` (junto das outras
`tauri-plugin-*`):

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

Em `package.json`, dentro de `"dependencies"`:

```json
"@tauri-apps/plugin-updater": "^2",
"@tauri-apps/plugin-process": "^2"
```

Rodar `bun install` depois de editar.

- [ ] **Step 3: Configurar `tauri.conf.json`**

Adicionar `"createUpdaterArtifacts": true` dentro de `"bundle"`, e um bloco
`"plugins"` novo no nível raiz (irmão de `"bundle"`), com a chave pública do
Step 1:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "createUpdaterArtifacts": true,
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]
},
"plugins": {
  "updater": {
    "pubkey": "COLE_A_CHAVE_PUBLICA_DO_STEP_1_AQUI",
    "endpoints": [
      "https://github.com/sthevan027/focusbrew/releases/latest/download/latest.json"
    ]
  }
}
```

- [ ] **Step 4: Verificar que o projeto ainda compila/bundla**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compila sem erro (os plugins ainda não estão registrados no
builder — isso é esperado, é a Task 2; este check só confirma que as deps
baixaram e o `Cargo.toml`/`tauri.conf.json` estão bem formados).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml package.json bun.lock src-tauri/tauri.conf.json
git commit -m "chore: dependências e config do tauri-plugin-updater"
```

---

### Task 2: Registrar os plugins e liberar as permissões

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: `tauri.conf.json` da Task 1 (pubkey/endpoints já configurados).
- Produces: os comandos `plugin:updater|check`, `plugin:updater|download_and_install` e
  `plugin:process|relaunch` ficam disponíveis pro frontend chamar (usados na Task 4).

- [ ] **Step 1: Registrar os plugins no builder**

Em `src-tauri/src/lib.rs`, dentro de `pub fn run()`, dentro do bloco
`#[cfg(not(any(target_os = "android", target_os = "ios")))]` que já existe
(onde `tauri_plugin_single_instance` é registrado), adicionar as duas linhas
junto da cadeia principal de `.plugin(...)` (não precisam do `cfg` do
single-instance — updater e process funcionam em todas as plataformas
desktop):

```rust
builder
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(global_shortcut_plugin)
```

(a linha `global_shortcut_plugin` já existe logo depois de
`tauri_plugin_notification::init()` — só inserir as duas novas entre elas e
a próxima.)

- [ ] **Step 2: Liberar as permissões**

Em `src-tauri/capabilities/default.json`, adicionar ao array `permissions`
(a lista de janelas `["main", "widget", "note"]` não muda — `main` já está
lá, é a única que vai usar isso):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window and the floating widget",
  "windows": ["main", "widget", "note"],
  "permissions": [
    "core:default",
    "opener:default",
    "updater:default",
    "process:default"
  ]
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compila sem erro.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: registra tauri-plugin-updater e tauri-plugin-process"
```

---

### Task 3: Reducer de estado da checagem (TDD)

**Files:**
- Create: `src/settings/updateStatus.ts`
- Test: `src/settings/updateStatus.test.ts`

**Interfaces:**
- Produces: `UpdateState`, `initialUpdateState`, `UpdateAction`, `updateStatusReducer(state, action): UpdateState`,
  `formatCheckedAt(ms: number): string`, `statusHint(state: UpdateState): string | undefined` — usados pela
  Task 4 (hook) e Task 5 (UI).

- [ ] **Step 1: Escrever os testes (vão falhar — o módulo não existe ainda)**

`src/settings/updateStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatCheckedAt, initialUpdateState, statusHint, updateStatusReducer } from "./updateStatus";

describe("updateStatusReducer", () => {
  it("marks checking and clears a previous error on check_start", () => {
    const state = updateStatusReducer({ ...initialUpdateState, error: "old" }, { type: "check_start" });
    expect(state.checking).toBe(true);
    expect(state.error).toBeNull();
  });

  it("records the timestamp and version on a successful check", () => {
    const state = updateStatusReducer(initialUpdateState, {
      type: "check_success",
      version: "0.5.0",
      nowMs: 1000,
    });
    expect(state).toMatchObject({ checking: false, lastCheckedMs: 1000, availableVersion: "0.5.0", error: null });
  });

  it("a successful check with no update clears a previously-seen version", () => {
    const stale = { ...initialUpdateState, availableVersion: "0.4.0" };
    const state = updateStatusReducer(stale, { type: "check_success", version: null, nowMs: 2000 });
    expect(state.availableVersion).toBeNull();
  });

  it("a silent check failure stops checking but changes nothing else", () => {
    const before = { ...initialUpdateState, lastCheckedMs: 500, availableVersion: "0.5.0" };
    const state = updateStatusReducer(before, {
      type: "check_error",
      silent: true,
      message: "offline",
      nowMs: 9999,
    });
    expect(state).toEqual({ ...before, checking: false });
  });

  it("a manual check failure records the timestamp and the error", () => {
    const state = updateStatusReducer(initialUpdateState, {
      type: "check_error",
      silent: false,
      message: "HTTP 500",
      nowMs: 3000,
    });
    expect(state).toMatchObject({ checking: false, lastCheckedMs: 3000, error: "HTTP 500" });
  });

  it("install_start clears a previous error", () => {
    const state = updateStatusReducer({ ...initialUpdateState, error: "old" }, { type: "install_start" });
    expect(state).toMatchObject({ installing: true, error: null });
  });

  it("install_error stops installing and records the message", () => {
    const state = updateStatusReducer({ ...initialUpdateState, installing: true }, {
      type: "install_error",
      message: "boom",
    });
    expect(state).toMatchObject({ installing: false, error: "boom" });
  });

  it("install_done just stops installing", () => {
    const state = updateStatusReducer({ ...initialUpdateState, installing: true }, { type: "install_done" });
    expect(state.installing).toBe(false);
  });
});

describe("formatCheckedAt", () => {
  it("writes local HH:MM, zero-padded", () => {
    const d = new Date(2026, 9, 9, 9, 5);
    expect(formatCheckedAt(d.getTime())).toBe("09:05");
  });
});

describe("statusHint", () => {
  it("is undefined before any check finished", () => {
    expect(statusHint(initialUpdateState)).toBeUndefined();
  });

  it("says up to date when there is no available version", () => {
    const state = { ...initialUpdateState, lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime() };
    expect(statusHint(state)).toBe("Você está na versão mais recente. Verificado às 17:09.");
  });

  it("names the available version", () => {
    const state = {
      ...initialUpdateState,
      lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime(),
      availableVersion: "0.5.0",
    };
    expect(statusHint(state)).toBe("Versão 0.5.0 disponível. Verificado às 17:09.");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test -- src/settings/updateStatus.test.ts`
Expected: FAIL — `Cannot find module './updateStatus'`.

- [ ] **Step 3: Implementar**

`src/settings/updateStatus.ts`:

```ts
export interface UpdateState {
  checking: boolean;
  installing: boolean;
  lastCheckedMs: number | null;
  availableVersion: string | null;
  error: string | null;
}

export const initialUpdateState: UpdateState = {
  checking: false,
  installing: false,
  lastCheckedMs: null,
  availableVersion: null,
  error: null,
};

export type UpdateAction =
  | { type: "check_start" }
  | { type: "check_success"; version: string | null; nowMs: number }
  | { type: "check_error"; silent: boolean; message: string; nowMs: number }
  | { type: "install_start" }
  | { type: "install_error"; message: string }
  | { type: "install_done" };

export function updateStatusReducer(state: UpdateState, action: UpdateAction): UpdateState {
  switch (action.type) {
    case "check_start":
      return { ...state, checking: true, error: null };
    case "check_success":
      return {
        ...state,
        checking: false,
        lastCheckedMs: action.nowMs,
        availableVersion: action.version,
        error: null,
      };
    case "check_error":
      return action.silent
        ? { ...state, checking: false }
        : { ...state, checking: false, lastCheckedMs: action.nowMs, error: action.message };
    case "install_start":
      return { ...state, installing: true, error: null };
    case "install_error":
      return { ...state, installing: false, error: action.message };
    case "install_done":
      return { ...state, installing: false };
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:05", from the local time of an epoch-ms moment. */
export function formatCheckedAt(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The line under "Atualizações"; undefined before the first check ever finishes. */
export function statusHint(state: UpdateState): string | undefined {
  if (state.lastCheckedMs === null) return undefined;
  const checked = `Verificado às ${formatCheckedAt(state.lastCheckedMs)}.`;
  if (state.availableVersion) return `Versão ${state.availableVersion} disponível. ${checked}`;
  return `Você está na versão mais recente. ${checked}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test -- src/settings/updateStatus.test.ts`
Expected: PASS, todos os `it` verdes.

- [ ] **Step 5: Commit**

```bash
git add src/settings/updateStatus.ts src/settings/updateStatus.test.ts
git commit -m "feat: reducer puro do status de atualização"
```

---

### Task 4: Hook que liga o reducer ao plugin de verdade

**Files:**
- Create: `src/settings/useUpdateStatus.ts`

**Interfaces:**
- Consumes: `initialUpdateState`, `updateStatusReducer`, `UpdateState` (Task 3); `check` de
  `@tauri-apps/plugin-updater`; `relaunch` de `@tauri-apps/plugin-process`.
- Produces: `useUpdateStatus(): { state: UpdateState; checkNow: () => void; install: () => void }` —
  usado pela Task 6 (`App.tsx`).

Sem teste automatizado: é fiação fina de I/O real contra o plugin do Tauri
(mesmo padrão de `src/lib/tauri.ts`, que também não é testado — a lógica que
vale testar já está isolada no reducer da Task 3). Verificado manualmente na
Task 7.

- [ ] **Step 1: Implementar**

`src/settings/useUpdateStatus.ts`:

```ts
import { useCallback, useEffect, useReducer, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { initialUpdateState, updateStatusReducer } from "./updateStatus";
import type { UpdateState } from "./updateStatus";

export interface UseUpdateStatus {
  state: UpdateState;
  checkNow: () => void;
  install: () => void;
}

/** Checks once when the window's webview loads (silently), then on demand. */
export function useUpdateStatus(): UseUpdateStatus {
  const [state, dispatch] = useReducer(updateStatusReducer, initialUpdateState);
  const found = useRef<Update | null>(null);

  const runCheck = useCallback(async (silent: boolean) => {
    dispatch({ type: "check_start" });
    try {
      const update = await check();
      found.current = update ?? null;
      dispatch({ type: "check_success", version: update?.version ?? null, nowMs: Date.now() });
    } catch (err) {
      dispatch({ type: "check_error", silent, message: String(err), nowMs: Date.now() });
    }
  }, []);

  useEffect(() => {
    runCheck(true);
    // Once, when this window's webview comes up — not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNow = useCallback(() => {
    runCheck(false);
  }, [runCheck]);

  const install = useCallback(() => {
    const update = found.current;
    if (!update) return;
    dispatch({ type: "install_start" });
    update
      .downloadAndInstall()
      .then(() => relaunch())
      .then(() => dispatch({ type: "install_done" }))
      .catch((err) => dispatch({ type: "install_error", message: String(err) }));
  }, []);

  return { state, checkNow, install };
}
```

- [ ] **Step 2: Verificar que typecheck/lint passam**

Run: `bun run build` (o build do Vite já roda `tsc`; é o jeito mais rápido
de pegar erro de tipo sem subir o app Tauri inteiro)
Expected: termina sem erro de TypeScript relacionado a este arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/settings/useUpdateStatus.ts
git commit -m "feat: hook useUpdateStatus liga o reducer ao plugin real"
```

---

### Task 5: Linha de UI (TDD)

**Files:**
- Create: `src/settings/UpdateRow.tsx`
- Test: `src/settings/UpdateRow.test.tsx`

**Interfaces:**
- Consumes: `UseUpdateStatus` (Task 4), `statusHint` (Task 3), `Row` (`./Row`).
- Produces: `<UpdateRow update={UseUpdateStatus} />` — usado pela Task 6 (`GeneralSection.tsx`).

- [ ] **Step 1: Escrever os testes (vão falhar — o componente não existe ainda)**

`src/settings/UpdateRow.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import UpdateRow from "./UpdateRow";
import { initialUpdateState } from "./updateStatus";
import type { UpdateState } from "./updateStatus";

const noop = () => {};
const render = (state: UpdateState) =>
  renderToStaticMarkup(<UpdateRow update={{ state, checkNow: noop, install: noop }} />);

describe("UpdateRow", () => {
  it("offers to check before any check has run", () => {
    const html = render(initialUpdateState);
    expect(html).toContain("Verificar agora");
    expect(html).not.toContain("Verificado às");
  });

  it("shows up to date after a clean check", () => {
    const html = render({ ...initialUpdateState, lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime() });
    expect(html).toContain("Você está na versão mais recente. Verificado às 17:09.");
    expect(html).toContain("Verificar agora");
  });

  it("offers to update when a version is available", () => {
    const html = render({
      ...initialUpdateState,
      lastCheckedMs: new Date(2026, 9, 9, 17, 9).getTime(),
      availableVersion: "0.5.0",
    });
    expect(html).toContain("Versão 0.5.0 disponível");
    expect(html).toContain("Atualizar agora");
  });

  it("shows the error text when there is one", () => {
    const html = render({ ...initialUpdateState, error: "sem internet" });
    expect(html).toContain("sem internet");
  });

  it("disables the button while checking or installing", () => {
    expect(render({ ...initialUpdateState, checking: true })).toContain("disabled");
    expect(render({ ...initialUpdateState, installing: true })).toContain("disabled");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test -- src/settings/UpdateRow.test.tsx`
Expected: FAIL — `Cannot find module './UpdateRow'`.

- [ ] **Step 3: Implementar**

`src/settings/UpdateRow.tsx`:

```tsx
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
        <button onClick={onClick} disabled={busy}>
          {label}
        </button>
      </Row>
      {state.error && <p className="error">{state.error}</p>}
    </>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test -- src/settings/UpdateRow.test.tsx`
Expected: PASS, todos os `it` verdes.

- [ ] **Step 5: Commit**

```bash
git add src/settings/UpdateRow.tsx src/settings/UpdateRow.test.tsx
git commit -m "feat: linha de UI das Atualizações"
```

---

### Task 6: Encaixar na aba Geral

**Files:**
- Modify: `src/settings/GeneralSection.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useUpdateStatus` (Task 4), `UpdateRow` (Task 5).

- [ ] **Step 1: `App.tsx` — chamar o hook e passar pra `GeneralSection`**

Em `src/App.tsx`, importar e chamar o hook no topo do componente, e passar o
resultado como prop nova:

```tsx
import { useUpdateStatus } from "./settings/useUpdateStatus";
// ...dentro de export default function App() {
const update = useUpdateStatus();
// ...
{section === "general" && (
  <GeneralSection config={state.config} set={set} shortcutWarning={state.shortcut_warning} update={update} />
)}
```

- [ ] **Step 2: `GeneralSection.tsx` — trocar o bloco "Versão" pela linha nova**

Importar `UpdateRow` e `UseUpdateStatus`, estender `SectionProps` nos
parâmetros da função com `update: UseUpdateStatus`, e trocar o último
`<div className="group">` (o que só tinha a Row "Versão") por:

```tsx
import UpdateRow from "./UpdateRow";
import type { UseUpdateStatus } from "./useUpdateStatus";

export default function GeneralSection({
  config,
  set,
  shortcutWarning,
  update,
}: SectionProps & { shortcutWarning: string | null; update: UseUpdateStatus }) {
  // ...resto igual...

  return (
    <>
      {/* ...grupos existentes sem mudança... */}

      <div className="group">
        <Row title="Versão">
          <span className="version">{version ? `focusbrew ${version}` : "focusbrew"}</span>
        </Row>
        <UpdateRow update={update} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Rodar a suíte inteira**

Run: `bun run test`
Expected: todos os testes passam (os existentes continuam verdes, mais os
das Tasks 3 e 5).

- [ ] **Step 3: Verificação manual no app real**

Run: `bun run tauri dev`

Abrir as configurações (ícone da bandeja → "Abrir configurações") → aba
Geral. Confirmar:
- O botão aparece como "Verificar agora" (sem versão nova — a checagem
  silenciosa do boot já deve ter rodado, já que a janela carrega desde o
  início mesmo oculta).
- Clicar nele: mostra "Verificando...", depois volta com o texto
  "Você está na versão mais recente. Verificado às HH:MM." (nenhuma release
  com `latest.json` existe ainda, então é isto que se espera).
- Desligar o Wi-Fi e clicar de novo: aparece um erro abaixo do botão (ao
  contrário da checagem automática, que não mostraria nada).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/settings/GeneralSection.tsx
git commit -m "feat: liga a checagem de atualização na aba Geral"
```

---

### Task 7: Documentar o processo de release e publicar v0.4.1

**Files:**
- Modify: `README.md` (ou o arquivo de notas de dev que o projeto já usa, se houver um mais específico — conferir antes de editar)

**Interfaces:** nenhuma nova; fecha o ciclo descrito na spec.

- [ ] **Step 1: Documentar a chave e o processo**

Adicionar uma seção curta (no README, junto de instruções de build/dev já
existentes, ou criar `docs/RELEASING.md` se o README não tiver uma seção de
dev) cobrindo:
- A chave privada do updater mora em `~/.tauri/focusbrew-updater.key`
  (gerada na Task 1), nunca commitada.
- Antes de `bun run tauri build`, exportar
  `TAURI_SIGNING_PRIVATE_KEY` (conteúdo do arquivo da chave) e
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- O build gera, além do instalador de sempre, um `.nsis.zip` + `.sig` e um
  `latest.json` — os três (mais o instalador `.exe` de sempre) sobem juntos
  na release do GitHub.

- [ ] **Step 2: Bump de versão e build real**

Subir a versão pra `0.4.1` em `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`
(`"version"` nos dois lugares, igual todas as releases anteriores já fazem).

Run (com as variáveis de ambiente da Step 1 exportadas):
```bash
bun run tauri build
```
Expected: gera o instalador NSIS de sempre, mais `focusbrew_0.4.1_x64-setup.nsis.zip`,
`focusbrew_0.4.1_x64-setup.nsis.zip.sig` e `latest.json` na pasta de bundle.

- [ ] **Step 3: Publicar a release**

```bash
gh release create v0.4.1 \
  "src-tauri/target/release/bundle/nsis/focusbrew_0.4.1_x64-setup.exe" \
  "src-tauri/target/release/bundle/nsis/focusbrew_0.4.1_x64-setup.nsis.zip" \
  "src-tauri/target/release/bundle/nsis/focusbrew_0.4.1_x64-setup.nsis.zip.sig" \
  "src-tauri/target/release/bundle/nsis/latest.json" \
  --title "focusbrew v0.4.1" \
  --notes "Auto-update: o app agora checa e aplica atualizações sozinho, pela aba Geral."
```

(Os nomes exatos de arquivo podem variar — conferir a pasta
`src-tauri/target/release/bundle/nsis/` depois do Step 2 e ajustar os
caminhos acima antes de rodar.)

- [ ] **Step 4: Registrar a limitação de bootstrap**

Sem passo de verificação automatizável aqui: só a partir da v0.4.2 (a
próxima release depois desta) existirá uma versão publicada que a v0.4.1
consiga de fato encontrar como "atualização disponível" — hoje o
`latest.json` que acabou de subir aponta pra ela mesma. Isso é esperado, não
é um bug; o teste real de ponta a ponta (achar + baixar + instalar uma
versão nova de verdade) fica pra quando a v0.4.2 existir.

- [ ] **Step 5: Commit do bump de versão (antes do build, junto com a doc)**

```bash
git add README.md src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "docs: processo de release com o updater; chore: versão 0.4.1"
```
