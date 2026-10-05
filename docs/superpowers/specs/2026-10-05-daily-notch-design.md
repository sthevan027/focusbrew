# focusbrew v0.2 — daily tracker no "notch" (etapa 1)

**Data:** 2026-10-05 · **Status:** aguardando revisão · **Branch:** `feat/daily-notch`
**Inspiração:** [daily-notch-tracker](https://github.com/lucianodiisouza/daily-notch-tracker)
(só ideia e visual; nenhum código ou imagem é copiado).

## 1. Objetivo

O focusbrew deixa de ser um "modo foco" que detecta processos, bloqueia apps e
liga o Não Perturbe (não funcionava bem e gerou travamentos). Passa a ser um
**tracker do dia pra dev**: uma lista de tarefas, cada uma com o seu timer, num
widget colado no topo da tela, com uma linha de progresso em volta e uma grade
de atividade.

**Dito pelo Sthevan:** seguir essa direção; copiar o visual do DailyNotch
(painel To Do + Activity, linha de progresso em volta do widget, modos
Minimal/Standard e RGB, janela de configurações com menu lateral); cores bem
escuras com **azul** de destaque, que o usuário troca nas configurações;
tamanho do widget configurável; o widget fica **colado no topo** da tela; parado
é uma **barra reta fina, sem nada dentro**; o painel abre **passando o mouse**;
só a etapa 1 agora.

**Sucesso:** abrir o app, passar o mouse no topo, adicionar uma tarefa, dar play,
ver a linha encher e, no fim, o quadradinho do dia ficar mais azul. Sem
travamentos, sem nenhum recurso do foco antigo.

## 2. Fora desta etapa (planejado depois)

- **Etapa 2:** GitHub dentro do dia (PRs/issues viram tarefas, commits e PRs
  alimentam a grade Activity).
- **Etapa 3:** tempo por projeto/ferramenta.
- **Etapa 4:** acabamento (monitor, alertas, atalhos configuráveis, iniciar com o
  Windows, nome e ícone, busca nas configurações).
- Não entram: calendário, planejar outros dias (existe uma única lista de tarefas
  abertas), editar a nota de uma tarefa pela interface, ícone de "expandir" do
  painel, abrir o painel ao clicar (só passar o mouse).
- Plataformas: **Windows**. O código não deve quebrar a compilação em
  Linux/macOS, mas o Não Perturbe (e a cor do sistema) deixam de existir lá.

## 3. Restrições globais

- Tauri 2 + React/TypeScript + Rust, como hoje. Gerenciador: **npm** (o projeto
  tem `package-lock.json`; não migrar pro Bun sem perguntar).
- Todo texto de interface em português do Brasil.
- Arquivos antigos do usuário (`settings.json`, `tasks.json`, `activity.json`)
  precisam continuar carregando sem apagar nada que ainda faça sentido.
- Nada de rede nova. O GitHub segue como está (login pelo `gh`, atualização
  automática a cada 5 min).
- Medidas abaixo são do tamanho **Médio** (escala 1,0). Pequeno = 0,85,
  Grande = 1,25; a escala vale pra largura, altura, fontes e espessura da linha.

## 4. O widget

Uma janela só (`widget`): transparente, sempre no topo, sem decoração, fora da
barra de tarefas.

**Posição.** Centralizada na horizontal no **monitor principal** e com o topo
exatamente no topo do monitor: `y = monitor.position().y`, `x = monitor.position().x +
(largura_do_monitor - largura_da_janela) / 2`, sem margem. A forma desenhada não
tem borda nem arredondamento em cima; só os dois cantos de baixo são
arredondados (raio 14 px). A linha de progresso nunca passa pelo topo.

**Estados:**

| Estado | Janela | O que aparece |
|---|---|---|
| Parado | 140×14 | Barra preta reta de 6 px de altura no topo, sem nada dentro. Os 14 px da janela são a área que reage ao mouse. |
| Rodando / pausado | 320×44 | Caixa preta. **Standard:** relógio + contagem à esquerda (`mm:ss`), nome da tarefa à direita (cortado com `…`). **Minimal:** nada dentro. Em pausa, a contagem pisca devagar. |
| Aberto | 470×230 | O painel (seção 5), com contorno fino de 1 px na cor de destaque. |

A mudança entre os estados é animada (~180 ms, a janela cresce e a forma
acompanha). O painel tem prioridade sobre os outros estados enquanto está aberto.
Com timer ativo, a linha de progresso continua sendo desenhada na borda do
painel (por cima do contorno de 1 px), com a mesma fração.

**Linha de progresso** (interruptor `progress_line`, ligado por padrão): 2 px,
em "U" — desce pelo lado esquerdo, corre pela borda de baixo e sobe pelo direito
(sem o topo). Preenche da esquerda pra direita: `fração = tempo_decorrido /
tempo_planejado`. Cor = cor de destaque. **RGB** (`rgb_line`, desligado por
padrão): troca a cor por um gradiente de arco-íris que gira (ciclo de 4 s) com
um brilho suave (blur de 6 px). A fração vem de `deadline_ms` e do relógio da
máquina, desenhada com `requestAnimationFrame`; a interface não conta tempo
sozinha.

**Abrir e fechar.** Passar o mouse na janela e ficar **250 ms** abre o painel.
Sair com o mouse e ficar fora **400 ms** fecha. Não fecha enquanto o campo "Add
a task" tem foco, nem durante um arraste. O estado "aberto" é pedido pela
interface com `set_widget_expanded(bool)`, que o backend aplica (tamanho e
posição).

**Cores** (padrão; o destaque é configurável): fundo do widget `#000000`,
painel `#0B0B0D`, linhas e cartões `#1A1A1D`, texto `#F2F2F3`, texto apagado
`#8A8A90`, destaque `#0A84FF`.

## 5. O painel

Duas colunas separadas por um traço vertical fino.

**Esquerda — "To Do"**, uma linha por tarefa aberta, na ordem da lista:

- círculo pra marcar como feita;
- título (1 linha, `…` se passar) e, embaixo, a nota em texto apagado, se houver;
- **tempo**: ícone de relógio, minutos e setinhas ▲▼ (de 5 em 5; mínimo 5,
  máximo 180);
- **play** redondo na cor de destaque (vira pausa na tarefa que roda);
- **alça** de seis pontos pra arrastar e reordenar.

A tarefa que roda fica com a linha destacada e mostra a contagem ao vivo no
lugar dos minutos. Cabem 4 linhas; passando disso a lista rola por dentro. Tarefas
concluídas ficam **depois** das abertas, riscadas e sem play nem alça (a ordem
guardada não muda, só a exibição). No fim, o campo **"Add a task"**: Enter
adiciona com os minutos padrão. Lista vazia mostra "Nenhuma tarefa ainda".

**Direita — "Activity":** ícone de barras + título; grade dos últimos 28 dias
(4 semanas), colunas = dias da semana (segunda a domingo), terminando na semana de
hoje. Cada quadradinho:

| Tempo de foco no dia | Cor |
|---|---|
| 0 | `#2A2A2D` |
| < 15 min | destaque a 30 % sobre o fundo |
| < 45 min | destaque a 55 % |
| < 90 min | destaque a 80 % |
| ≥ 90 min | destaque a 100 % |

Dica ao passar o mouse: `dd/mm — Xh Ymin`. Dias futuros da semana atual ficam
vazios (sem quadrado).

**Reordenar:** arraste por eventos de ponteiro (sem biblioteca), só entre
tarefas abertas, com uma linha-guia mostrando onde vai cair. A conta da nova
posição é uma função pura (`reorder`).

## 6. O timer

Autoridade no **backend**. Estado:

```
Timer = Idle
      | Running { task_id, planned_secs, deadline_ms }
      | Paused  { task_id, planned_secs, remaining_secs }
```

`elapsed = planned_secs - remaining`, onde `remaining = deadline_ms - agora` se
está rodando e `remaining_secs` se está pausado.

- **Iniciar uma tarefa** (`start_task`): se há outra rodando ou pausada, ela é
  encerrada e o tempo dela é guardado. Tarefa já concluída não inicia. Dar play
  na tarefa que **já está rodando** não faz nada; na que está **pausada**,
  retoma.
- **Pausar/retomar** (`toggle_pause`): pausar congela `remaining_secs`; retomar
  recalcula `deadline_ms = agora + remaining_secs`.
- **Parar** (`stop_timer`): guarda o tempo trabalhado e vai a `Idle`.
- **Mudar os minutos com a tarefa rodando ou pausada:** `planned_secs` novo; o
  decorrido não muda; `remaining = novo_planejado - decorrido`. Se ficar `<= 0`,
  o bloco termina agora.
- **Marcar como feita, apagar a tarefa ou fechar o app** com ela ativa:
  encerra o bloco guardando o tempo trabalhado (fechar o app usa o mesmo gancho
  `RunEvent::Exit` que já existe).
- **Chegar a zero:** guarda `planned_secs`, notifica **"Bloco concluído"**
  (corpo: título e minutos) se `notify_on_finish`, a tarefa **continua aberta**
  e o timer vai a `Idle`.
- **Computador dormindo:** o backend confere o relógio a cada 1 s. Se passaram
  mais de 90 s entre duas conferências, esse intervalo não conta: se está
  rodando, `deadline_ms += intervalo`.
- **Guardar tempo** significa: `task.spent_secs += decorrido` e
  `focus_secs_by_day[hoje] += decorrido`, onde "hoje" é a data local do **fim**
  do bloco. Decorrido `0` não grava nada.

**Atalho global** `Ctrl+Shift+Space`: se há timer ativo, pausa/retoma; se está
parado, inicia a primeira tarefa aberta (sem tarefa aberta, não faz nada).

## 7. Dados

**`Task`** (`tasks.json`): `id`, `title`, `note: Option<String>`, `minutes: u32`,
`done`, `created_at`, `source` (`manual` | `github`), `spent_secs: u32`. Campos
novos têm valor padrão ao ler arquivo antigo (`minutes` = 25, `spent_secs` = 0,
`note` = nenhuma). Título: aparado, não vazio, no máximo 200 caracteres.
`minutes` sempre limitado a 5..=180. A **ordem do vetor é a ordem da lista**.
`import_github_item_as_task` passa a preencher `note` com o repositório
(`dono/repo #N`).

**`ActivityLog`** (`activity.json`): novo campo `focus_secs_by_day:
HashMap<"AAAA-MM-DD", u32>` com `#[serde(default)]`. Os campos antigos (`days`,
`sessions`, `app_seconds_*`) deixam de ser lidos; o arquivo antigo carrega e o
histórico antigo é simplesmente ignorado.

**`AppConfig`** (`settings.json`), com `#[serde(default)]` na struct inteira pra
arquivo antigo ou parcial manter o que existe:

| Campo | Padrão |
|---|---|
| `default_minutes` | 25 |
| `notify_on_finish` | `true` |
| `notch_style` | `"standard"` (`"minimal"`) |
| `progress_line` | `true` |
| `rgb_line` | `false` |
| `accent_color` | `"#0A84FF"` (valida `#RRGGBB`; inválido → padrão) |
| `widget_scale` | `"medium"` (`"small"`, `"large"`) |
| `widget_visible` | `true` |
| `github_login`, `github_use_gh` | como hoje |

Saem: `monitored_processes`, `blocked_apps`, `poll_interval_secs`,
`focus_auto_enable`, `block_apps_enabled`, `dnd_enabled`, `timer`, `ring_color`.

**`StateSnapshot`** (evento `state-changed`): `tasks`, `timer` (`status`:
`idle|running|paused`, `task_id`, `planned_secs`, `remaining_secs`,
`deadline_ms`), `focus_secs_by_day`, `config`, e os campos `github_*` atuais. Saem
`activity`, `focus_mode`, `focus_days`, `streak`, `sessions`,
`app_seconds_today`, `uptime_secs`.

## 8. Comandos (IPC)

Novos ou alterados: `add_task(title)`, `toggle_task(id)`, `remove_task(id)`,
`update_task_minutes(id, minutes)`, `reorder_tasks(ids)` (ids ausentes vão pro
fim, desconhecidos são ignorados), `start_task(id)`, `toggle_pause()`,
`stop_timer()`, `update_settings(newConfig)`, `set_widget_expanded(bool)`,
`open_settings_window()`. Ficam como estão: `get_state`, os comandos do GitHub,
`import_github_item_as_task`. Saem: `start_coffee_break`, `toggle_pause_timer`,
`toggle_focus_session`, `get_accent_color`, `toggle_widget_visibility` (vira
`widget_visible` nas configurações e no menu da bandeja).

O loop de fundo de 1 s deixa de varrer processos; só confere o timer (fim do
bloco e salto de relógio).

## 9. Bandeja

Um ícone só (o `idle.png` atual; `focus.png`, `working.png` e `coffee.png` saem).
Dica: `focusbrew` parado, ou `focusbrew — <tarefa> mm:ss` com timer ativo.
Clique esquerdo abre as configurações. Menu: **Abrir configurações**,
**Mostrar/ocultar widget**, **Pausar/retomar** (só com timer ativo), **Sair**.

## 10. Janela de configurações

A janela `main` (680×640, escondida ao fechar, como hoje) vira as configurações:
menu lateral escuro à esquerda e o conteúdo à direita.

- **Foco:** minutos padrão (5–180) e "Avisar quando o bloco terminar".
- **Notch:** dois cartões **Standard** e **Minimal** (cada um com uma miniatura
  desenhada com CSS), interruptores *Progress timeline* e *RGB timeline*, **cor de
  destaque** (6 cores prontas + campo hex) e **tamanho** (Pequeno/Médio/Grande).
  Com o RGB ligado, só a linha de progresso vira arco-íris; a cor de destaque
  continua valendo pro resto (botão play, grade Activity, contorno do painel).
- **Geral:** mostrar o widget e a versão do app.
- **GitHub:** o `GithubPanel` atual, sem mudanças.

## 11. Remoções

Rust: `detector.rs`, `focus.rs`, `platform/` (Não Perturbe e cor do sistema),
`TimerPhase::Break`, `TimerConfig`. Front-end: `Dashboard.tsx`, `TaskBoard.tsx`,
`Settings.tsx`, `appIcons.ts`, `heatmap.ts`. Ícones de bandeja `focus`,
`working`, `coffee`. Dependências que ficarem sem uso (`winreg`, e `sysinfo` se
nada mais usar) saem do `Cargo.toml`. O README é reescrito e os 8 prints antigos
são substituídos por prints do app novo.

## 12. Arquitetura (arquivos)

| Arquivo | Responsabilidade |
|---|---|
| `src-tauri/src/timer.rs` (reescrito) | O enum `Timer`, as transições e as contas de tempo. Puro, sem Tauri. |
| `src-tauri/src/tasks.rs` | `Task`, leitura/gravação, `reorder`, limites. |
| `src-tauri/src/activity.rs` | `focus_secs_by_day` e `add_focus_secs`. |
| `src-tauri/src/config.rs` | `AppConfig` novo e validações. |
| `src-tauri/src/state.rs` | `AppState` e `StateSnapshot` novos. |
| `src-tauri/src/commands.rs` | os comandos da seção 8. |
| `src-tauri/src/widget.rs` | janela, posição colada no topo, tamanhos por escala. |
| `src-tauri/src/lib.rs` | bandeja, atalho, loop de 1 s, notificação. |
| `src/Widget.tsx` + `src/widget/*` | `Notch`, `ProgressLine`, `TodoPanel`, `TaskRow`, `ActivityGrid`. |
| `src/lib/progress.ts`, `src/lib/activity.ts`, `src/lib/reorder.ts` | contas puras e testáveis. |
| `src/App.tsx` + `src/settings/*` | menu lateral e as seções. |
| `src/lib/tauri.ts`, `src/lib/types.ts` | IPC e tipos novos. |

Quem faz o quê é decidido por responsabilidade: o timer não sabe de Tauri, a
interface não conta tempo, e a janela só aplica o tamanho que a interface pede.

## 13. Testes

**Rust (unitários):** timer — iniciar, trocar de tarefa guardando o tempo,
pausar/retomar (o tempo pausado não conta), mudar os minutos rodando
(inclusive pra um valor que já passou), parar antes do fim, chegar a zero,
salto de relógio > 90 s, tarefa feita/apagada com timer ativo, decorrido zero não
grava. Tarefas — arquivo antigo carrega com os padrões, limites de minutos e
título, `reorder` com ids ausentes/desconhecidos. Config — arquivo antigo (com
campos que saíram) e parcial mantém os valores, cor inválida volta ao padrão.
Activity — soma por dia, dia do fim do bloco, arquivo antigo carrega.

**Front-end (`vitest`, dependência nova de desenvolvimento):** `progress.ts`
(fração e comprimento da linha em "U"), `activity.ts` (montagem das 4 semanas,
faixas de cor), `reorder.ts`.

**No app real** (WebView2 por CDP, como nos testes do `gh`): painel abre com o
mouse depois de ~250 ms e fecha ~400 ms depois de sair; adicionar tarefa; play,
pausa e retomada; a linha enche; a barra parada fica no `y = 0`; aparece o
tamanho certo em cada escala; o atalho global. Comparar com os prints de
referência. Teste de estresse do atalho como o que já existe (sem travar).

## 14. Entrega

1. PR #4 já mesclado; trabalho no `feat/daily-notch`.
2. Plano de implementação em `docs/superpowers/plans/`.
3. Ao final: versão **0.2.0** (`package.json`, `Cargo.toml`, `Cargo.lock`,
   `tauri.conf.json`), instalador assinado (`npm run dist:signed`), release
   `v0.2.0`.

## 15. Riscos e pontos a confirmar na prática

- **Mouse sobre pixels transparentes:** a janela do widget é transparente; é
  preciso confirmar no app real que a área de 140×14 do estado parado reage ao
  mouse. Se não reagir, a barra parada passa a ter fundo quase invisível
  (`rgba(0,0,0,0.01)`) na área de ativação.
- **Arrastar no WebView2:** o `dragDrop` nativo do Tauri intercepta o arrastar do
  HTML5 no Windows; por isso o reordenar usa eventos de ponteiro e não o `draggable`.
- **Redimensionar a janela com o mouse em cima:** pode piscar; a animação cresce
  a janela de uma vez e anima só a forma por dentro.
- **Barra de tarefas no topo e apps em tela cheia:** o widget fica por cima, como
  hoje. Não tratado nesta etapa.
- **Dormir sem relógio confiável:** o limite de 90 s é uma heurística; um bloco
  pode contar até 90 s a mais ou a menos.
