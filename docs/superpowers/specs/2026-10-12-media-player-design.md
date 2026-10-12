# focusbrew — Player de música no widget

**Data:** 2026-10-12 · **Branch:** a definir no plano de implementação.

## 1. Objetivo

**Dito pelo Sthevan:** quer o widget reagindo a qualquer mídia tocando no
computador (Spotify, navegador, etc.), igual ao que a Ilha do Niko faz —
sem música, o widget fica na doca antiga (nada muda); com música, aparece
uma área com a capa/progresso de um lado e os controles de play do outro.
O painel expandido ganha uma aba nova só pra isso. Quando o timer de foco
*e* a música estão ativos ao mesmo tempo, em vez de disputar espaço pela
cascata de prioridade que já existe, quer poder alternar entre as duas (
tarefa e música) passando o mouse por cima do widget e usando Ctrl+Scroll.

**Sucesso:** toca qualquer coisa no Windows → o quadrado da capa/progresso
e os controles aparecem no widget compacto, sem precisar abrir nada. Para a
música → o widget volta a ser só o que já era antes (bar/box do timer,
sem a área de música). Com timer rodando e música tocando ao mesmo tempo,
Ctrl+Scroll com o mouse sobre o widget alterna entre a aba de tarefa (que
aparece primeiro, por padrão) e a de música. Painel expandido ganha a aba
"Música" quando tem mídia ativa.

**Fica de fora desta spec:** integração direta com a API do Spotify (login,
playlists, "curtir"), controlar mídia em outro computador/dispositivo,
qualquer coisa que não seja ler/pausar/avançar/voltar a faixa atual.

## 2. Mecanismo: SMTC (System Media Transport Controls)

API nativa do Windows, já exposta pela crate `windows` (dependência
existente, usada hoje pra `SetWindowPos`/cursor/registro). Novo módulo
`src-tauri/src/media.rs`:

- `GlobalSystemMediaTransportControlsSessionManager::RequestAsync` pega a
  sessão de mídia "atual" do sistema (o app que está tocando agora — o
  Windows já resolve qual, igual ao painel de mídia nativo do Win11).
- Lê `TryGetMediaPropertiesAsync` (título, artista, capa como bytes de
  imagem) e `GetTimelineProperties` (posição/duração) a cada tick do loop
  de 1s que já existe (`state.rs`/`lib.rs`), só quando há sessão ativa —
  sem sessão, não gasta ciclo nenhum lendo mídia.
- Controles: `TryPlayAsync`, `TryPauseAsync`, `TrySkipNextAsync`,
  `TrySkipPreviousAsync` na sessão atual — comandos Tauri novos
  (`media_play`, `media_pause`, `media_next`, `media_previous`).
- Sem sessão nenhuma tocando (`RequestAsync` retorna sessão nula/erro) =
  `media: None` no estado — é o sinal de "sem música" pro frontend.

## 3. Integração com a forma do widget (`pickShape`)

Hoje `pickShape` (`src/lib/shell.ts`) decide a forma só pelo status do
timer: `idle` → `bar`; `running`/`paused` → `box`. Ganha um novo campo no
`ShapeContext`, `hasMedia: boolean`:

```
hidden > open note > open panel > (running/paused timer OU mídia ativa) > parked bar
```

- **Timer idle + sem mídia:** `bar` (doca antiga, sem alteração).
- **Timer idle + com mídia:** `box`, mas só a aba de música (não tem tarefa
  pra competir).
- **Timer ativo + sem mídia:** `box`, só a aba de tarefa (comportamento
  atual, sem UI de abas visível).
- **Timer ativo + com mídia:** `box`, com as duas abas — tarefa é a
  padrão, música a um Ctrl+Scroll de distância (ver seção 4).

O `box` em si (tamanho/posição) não muda — é a mesma caixa de hoje, só o
conteúdo de dentro que agora pode ser a música em vez da tarefa.

## 4. Conteúdo do `box`: abas tarefa/música

Nova função pura em `src/lib/shell.ts` (ou arquivo próprio
`src/widget/mediaTabs.ts`), espelhando o estilo de `holding.ts`:

```ts
type BoxTab = "task" | "media";
function defaultTab(hasTask: boolean, hasMedia: boolean): BoxTab // "task" sempre que houver as duas
function nextTab(current: BoxTab, hasTask: boolean, hasMedia: boolean, delta: number): BoxTab
```

- `onWheel` no elemento do widget: só reage quando `event.ctrlKey` é
  verdadeiro (senão o scroll normal da página/lista não é afetado) e
  `preventDefault()` pra não dar zoom no navegador/webview.
- Com só uma das duas fontes ativa, o scroll não faz nada (não tem pra
  onde alternar) — `nextTab` retorna a mesma aba.
- Layout da aba de música no `box`: metade esquerda = capa (ou um ícone de
  nota musical se a mídia não tiver capa) com o progresso como um anel ou
  barra fina embaixo, igual ao estilo do anel de progresso do timer;
  metade direita = três botões (anterior/play-pause/próxima).

## 5. Painel expandido: aba "Música"

Mesma estrutura das abas existentes do painel (Tarefas / Resumo do dia /
GitHub, em `Panel.tsx`): uma aba nova "Música", só visível na lista de abas
quando `hasMedia` é verdadeiro (some quando a música para, igual à aba
GitHub que só aparece conectado). Mostra capa maior, barra de progresso
arrastável (seek via `TryChangePlaybackPositionAsync`), título/artista e os
mesmos controles do `box`.

## 6. Dados e estado

- Novo tipo no Rust/TS: `MediaView { title, artist, cover_data_url:
  Option<String>, position_secs, duration_secs, status: "playing" |
  "paused" }` — `None`/`null` inteiro quando não há sessão.
- `StateSnapshot`/`AppState` ganham `media: Option<MediaView>` (Rust) /
  `media: MediaView | null` (TS), publicado no mesmo snapshot de sempre —
  sem canal novo.
- Estado da aba ativa (`task`/`media`) vive só no React, em memória (não
  persiste entre aberturas — sempre volta pra tarefa por padrão).
- Capa da mídia: bytes convertidos pra um `data:` URL direto no Rust antes
  de entrar no snapshot (sem salvar em disco, sem endpoint HTTP local).

## 7. Testes

- Rust: unit tests da leitura de `GetTimelineProperties` com dados
  simulados (posição/duração), e do fallback quando a sessão não tem capa.
- Frontend: `defaultTab`/`nextTab` (tarefa por padrão com as duas ativas,
  scroll sem ctrlKey não faz nada, scroll com só uma fonte ativa não
  alterna), `pickShape` com os 4 casos de `hasMedia` × status do timer.
- Verificação manual real: tocar uma faixa no Spotify desktop e no Chrome
  (YouTube) separadamente, confirmar capa/progresso/controles reais,
  testar Ctrl+Scroll com timer rodando ao mesmo tempo, parar a mídia e
  confirmar que o widget volta pra doca antiga.
