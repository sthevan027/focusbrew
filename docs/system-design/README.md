# System design do focusbrew (v0.7.1)

Lido do código em 28/10/2026. Cada afirmação aponta o arquivo de onde veio; o que é estimativa ou inferência está marcado. O quadro está em [`focusbrew-system-design-v2.excalidraw`](./focusbrew-system-design-v2.excalidraw).

> **Sobre o "Master Template" de system design** (load balancer, API gateway, CDN, sharding, data warehouse): é um mapa para sistemas web distribuídos. O focusbrew é **um usuário numa máquina Windows**, com arquivos locais e um processo auxiliar. Desenhar esses blocos aqui seria errado. Um design sênior para este sistema mostra **requisitos, números, falhas, decisões com alternativas e o caminho de evolução**. A seção 11 usa o template, rotulado como hipótese, para mostrar o que mudaria se o app virasse multidispositivo.

## 1. Requisitos

**Funcionais:** planejar tarefas por dia; cronometrar blocos de foco por tarefa; resumo do dia e histórico (grade de 5 semanas); notas rápidas com texto, desenho e imagens; importar PRs e issues do GitHub como tarefa; sincronizar tarefas do dia com o Google Agenda; mostrar e controlar a mídia que toca; (opcional) tempo por aplicativo.

**Não funcionais, na ordem em que o código os prioriza:**
1. **Durabilidade das tarefas e notas do usuário.** É o que ele não perdoa perder.
2. **UI sempre responsiva.** Chamadas de rede com tempo limite (2 s no serviço local), mídia fora da trava (`spawn_blocking`), trabalho de janela postado à thread principal.
3. **Offline-first.** Tudo funciona sem rede; GitHub e Google só enriquecem.
4. **Privacidade.** Dados ficam na máquina, tokens no keyring, atividade por app só em loopback.
5. **Baixo custo em repouso.** Um tick por segundo, sem polling pesado.

**Fora de escopo (decisões, não esquecimentos):** multiusuário, multidispositivo, nuvem própria, outros sistemas operacionais (usa `windows` crate, SMTC e `HKCU\...\Run`).

## 2. Números (da própria configuração do código)

| Grandeza | Valor | Fonte |
|---|---|---|
| Usuários | 1 | — |
| Tick do backend | 1/s (86.400/dia) | `lib.rs: spawn_tick_loop` |
| Atualização do GitHub | a cada 5 min (288 ciclos/dia, **≥3 chamadas por ciclo**: itens, calendário, eventos) | `lib.rs`, `commands.rs:521` |
| Sincronia do Google | a cada 5 min (288/dia; 1 listagem do dia + escritas só nas tarefas que mudaram) | `lib.rs`, `google_sync.rs` |
| Notas | ≤ 1.000, ≤ 20.000 caracteres, ≤ 10 imagens cada: **teto de ~20 MB de texto** | `notes.rs` |
| Blocos concluídos | 400 dias; o snapshot leva só os últimos 42 | `activity.rs`, `state.rs` |
| Atividade por app | 90 dias (30–365) | `src-tauri-service/models.rs` |
| Linhas no SQLite | **estimativa, não medida:** 1–3 mil trocas de app/dia × 90 dias ≈ 90–270 mil linhas, dezenas de MB | inferência |
| Tarefas | sem limite no código | `tasks.rs` |

Conclusão de capacidade: o volume é de **KB a poucos MB** por usuário. Nada aqui justifica banco servidor, cache, fila ou particionamento. Os gargalos reais são de **correção** (seção 7), não de escala.

## 3. Contêineres

```
┌──────────────── Processo focusbrew (Tauri 2) ────────────────┐
│ Frontend React/TS: widget · main (Configurações) · note      │
│    │ invoke (44 comandos)        ▲ state-changed / notes-changed
│    ▼                             │
│ Backend Rust: commands → AppState[Mutex]  ·  NotesStore[Mutex]
│    loops: tick 1 s · GitHub 5 min · Google 5 min · hover     │
└────┬───────────────────────────────────────────┬─────────────┘
     │ arquivos / keyring                        │ HTTP 127.0.0.1:8765
     ▼                                           ▼
 settings · tasks · activity · notes.json   ┌─ focusbrew-tracker ─┐
 notes/images/ · keyring do SO              │ collector → recorder │
                                            │ → SQLite · axum      │
                                            └──────────────────────┘
```

- Três janelas carregam o **mesmo bundle** e se distinguem pelo `label` (`widget`, `main`, `note`).
- O serviço de atividade roda **na sessão do usuário**, iniciado por `HKCU\...\Run`. Como Windows Service ele rodava na Session 0, onde `GetForegroundWindow` retorna NULL (nota do vault de 18/10).
- A atividade por app é **opcional e desligada por padrão** (`activity_tracking_enabled: false` no `Default` de `AppConfig`). Desligada, o app não chama o serviço.

## 4. Módulos do backend

| Módulo | Responsabilidade |
|---|---|
| `lib.rs` | monta o app, registra os 44 comandos, tray, atalhos, loops |
| `commands.rs` | borda IPC: valida, muda o estado, publica |
| `state.rs` | `AppState` e o `StateSnapshot` que vai para a UI |
| `tracker/{tasks,timer,activity,mod}.rs` | tarefas, timer (**puro**), histórico, `tick()` |
| `config.rs` | `AppConfig`, normalização |
| `notes.rs` | notas, desenho, imagens (**trava própria**) |
| `github.rs` · `google_calendar.rs` · `google_sync.rs` | integrações; `decide()` da sincronia é **pura** |
| `media.rs` | SMTC |
| `widget.rs` · `note_window.rs` | janelas, borda, monitor, zona de hover |
| `alerts.rs` | aviso antes do fim, meta do dia, ociosidade |
| `activity_tracking/` | cliente HTTP do serviço |

## 5. Dados e armazenamento

| Dado | Onde | Formato | Retenção | Escrita |
|---|---|---|---|---|
| Configurações | `settings.json` (config dir) | JSON | — | `fs::write` |
| Tarefas | `tasks.json` (data dir) | JSON (array) | sem limite | `fs::write` |
| Blocos e foco por dia | `activity.json` | JSON | 400 dias | `fs::write` |
| Notas | `notes.json` + `notes/images/` | JSON com `version: 1` | ≤ 1.000 notas | **tmp + rename** |
| Tokens | keyring do SO | segredo | — | `keyring` |
| Uso por app | `%LOCALAPPDATA%\focusbrew\activity.db` | SQLite | 90 dias | `INSERT` por segmento |

**Por que dois mundos?** Tarefas e notas são poucas, lidas inteiras e editadas pela UI: arquivo em memória basta. O uso por app é série temporal com consulta por intervalo e agregação (`SUM`, `GROUP BY`): é caso de banco. A divisão está certa; o que falta é aplicar à persistência de JSON o mesmo cuidado que o banco já tem (seção 7).

**Modelo:**
- `Task`: `id`, `title`, `note?`, `minutes` (5–180), `done`, `done_at?`, `created_at`, `source` (`manual | github | google_calendar`), `spent_secs`, `day`, `project?`, `url?`, `google_event_id?`, `updated_at` (decide a sincronia).
- `Session`: `task_id`, `title`, `project?`, `day`, `ended_ms`, `secs`. Título e projeto são **copiados** ao fim do bloco: o histórico não muda se a tarefa mudar. `task_id` não tem chave estrangeira, porque os arquivos são independentes.
- `ActivityLog`: `focus_secs_by_day` + `sessions[]`.
- `Note`: `id`, `created_ms`, `updated_ms`, `text`, `objects[]` (traço, forma, imagem).
- SQLite `activities`: `id`, `app_name`, `started_at`, `ended_at?`, `is_idle`, `continued`, `created_at`; índices em `started_at` e `app_name`. `config`: chave e valor.

## 6. Contratos

**IPC (UI → backend), 44 comandos.** Padrão das tarefas e do timer: `apply()` trava o estado, muda, grava `tasks.json` e `activity.json`, publica e devolve o snapshot. **Só 10 comandos usam `apply`** (`add_task`, `edit_task`, `move_task`, `set_task_minutes`, `toggle_task`, `reorder_tasks`, `start_task`, `toggle_pause`, `stop_timer`, `google_import_event`). Os demais gravam por conta própria: configurações e tokens gravam `settings.json`, notas gravam `notes.json`.

**Eventos (backend → UI), dois estilos diferentes:**
- `state-changed` leva o **snapshot inteiro** (`StateSnapshot`: tarefas, timer, foco por dia, sessões dos últimos 42 dias, config, itens e eventos do GitHub, estado do Google, mídia). Todo comando de estado também devolve o snapshot, então a UI não depende só do evento.
- `notes-changed` não leva dados: a UI chama `list_notes` de novo.
- Eventos por janela: `toggle-panel`, `open-note`, `widget-cursor-outside`, `note-flash`.

**O snapshot não inclui a atividade por app.** Ela vem por comandos próprios (`get_activity_report`, `get_activity_config`).

**HTTP do serviço (loopback):** `GET /api/activities?from&to&app_filter?` (recorta cada sessão ao intervalo), `GET|POST /api/config`, `GET /api/health`. Valida o cabeçalho `Host` contra DNS rebinding. **Não há autenticação.**

## 7. Concorrência e falhas

**Travas:** são **duas independentes**: `Shared(Mutex<AppState>)` e `NotesShared(Mutex<NotesStore>)`. Verifiquei que nenhum caminho segura as duas ao mesmo tempo: na abertura só a de notas, na saída só a de estado. Trava envenenada é recuperada (`into_inner`). O código já teve deadlock quando um setter de janela esperava a thread principal enquanto ela esperava a trava; a solução foi postar o trabalho (`sync_ui`).

**O relógio:** o backend guarda um **prazo absoluto** (`deadline_ms`). O frontend não decide nada do tempo, mas **calcula `deadline − agora`** no próprio relógio (`useNow`). O backend só publica quando algo muda, não a cada segundo. Se passam mais de 90 s entre dois ticks (computador dormiu), `tick()` **empurra o prazo** pelo intervalo: o bloco **se estende** em vez de terminar ou de contar o sono como trabalho.

| # | Falha | Efeito hoje | Lacuna |
|---|---|---|---|
| 1 | Processo morre durante a gravação de `tasks.json`, `activity.json` ou `settings.json` | arquivo truncado → `parse` devolve vazio (`unwrap_or_default`) → a próxima mudança **sobrescreve com lista vazia** | **perda silenciosa**; `notes.rs` já protege (tmp + rename + quarentena). Não reproduzi |
| 2 | A gravação falha (disco cheio, antivírus, permissão) | **12 pontos** descartam o erro (`let _ =`); a UI mostra um estado que não persistiu | sem aviso e sem log |
| 3 | Crash duro com bloco rodando | o tempo do bloco em curso se perde (salva ao terminar, parar ou sair normalmente) | só há tratamento para saída normal |
| 4 | GitHub ou Google fora do ar | mantém a última lista boa e mostra o erro | ok |
| 5 | Token do Google revogado | desconecta e pede nova conexão (0.7.0) | ok |
| 6 | Serviço de atividade fora | tempo limite de 2 s; a UI mostra offline | ok (feature opcional) |
| 7 | Outro programa ocupa a porta 8765 | o app fala com quem estiver lá; só `/api/health` serve de identificação | sem handshake forte (inferência) |
| 8 | Computador dorme com bloco rodando | o prazo é empurrado; o bloco se estende | decisão de produto, ok |
| 9 | Relógio do sistema muda | o dia vem do relógio local; `last_day` detecta a virada | mudança manual de hora não tratada (inferência) |
| 10 | Chave do atualizador muda | quem está na versão anterior instala à mão uma vez | aconteceu na 0.5.0 e na 0.7.0 |

## 8. Segurança

- **Segredos:** token do GitHub e refresh token do Google no keyring; access token do Google só em memória.
- **Webview:** CSP restritiva em `tauri.conf.json` (`default-src 'self'`, `connect-src` só IPC).
- **Arquivos:** `read_image_file` só lê o que o sistema entregou num arrastar e soltar (`DroppedPaths`); nomes de imagem são validados (16 hex + extensão).
- **Serviço local:** só `127.0.0.1`, valida `Host`, e a ACL da pasta é aplicada no script de instalação (nota de 18/10; **não verifiquei hoje**).
- **Atualizador:** pacote assinado com minisign; a chave pública fica no `tauri.conf.json`.
- **Lacuna:** a API do serviço não autentica. Qualquer processo do usuário lê o tempo por aplicativo. Baixo risco num app pessoal, relevante se for distribuído.

## 9. Observabilidade

O **backend Rust não tem log nenhum** (busca por `println`, `eprintln`, `log::` e `tracing` em `src-tauri/src` não encontra nada). Erros de gravação são engolidos (falha 2). O **serviço** tem `log.rs` e `tracker.log`, com `ErrorGate` para não repetir o mesmo erro a cada segundo. Sem métricas e sem relatório de falha. Para um app pessoal é aceitável; para suporte a terceiros, não.

## 10. Decisões, com as alternativas

| Decisão | Alternativa | Por que a escolha | Custo |
|---|---|---|---|
| Estado único no backend, UI recebe snapshots | UI com estado próprio | uma fonte da verdade; sem divergência | snapshot completo a cada mudança; cresce com tarefas, itens do GitHub e sessões |
| Backend dono do tempo (prazo absoluto) | contagem incremental no frontend | não deriva; sobrevive a lag de janela | o frontend ainda lê o relógio para desenhar |
| JSON para tarefas e notas | SQLite para tudo | simples, em memória, legível | sem transações; atomicidade só nas notas |
| Serviço de atividade em **outro processo** | thread dentro do app | foi tentado como Windows Service e falhou (Session 0); hoje é processo na sessão do usuário | porta local, API sem auth, dois ciclos de vida |
| HTTP em loopback entre os processos | named pipe com ACL | simples e testável (axum + tower) | superfície de rede local sem autenticação |
| Sincronia com o Google: **último que editou vence** | CRDT ou fusão por campo | suficiente para título e feito/aberto de tarefas do dia | depende dos relógios; só o dia atual entra |
| Lógica pura separada de I/O (`timer`, `google_sync::decide`) | misturar com Tauri e rede | testável sem nada; **240 `#[test]`** em `src-tauri` | mais camadas |

**Sobre "serviço em outro processo":** o motivo original da separação não está documentado no código; o que está registrado é a mudança de Windows Service para processo do usuário. Se o objetivo era coletar mesmo com o app fechado, isso se mantém; se não, uma thread no app eliminaria a porta e a API.

## 11. Evolução (hipotética): e se virasse multidispositivo?

Nada disso existe hoje. É o que um sênior diria sobre o próximo degrau.

**O que entraria:** um serviço de sincronização atrás de **API gateway com autenticação** (o cliente continua offline-first); **Postgres** para tarefas, notas e sessões; **armazenamento de objetos** para as imagens das notas; **fila + workers** para GitHub e Google (webhooks no lugar do polling de 5 min por cliente); resolução de conflito **por campo** no lugar de "último vence"; logs e métricas centralizados.

**Conta de capacidade (hipótese):** 10.000 usuários × ~100 escritas/dia ≈ 1 milhão/dia ≈ **12 escritas/s em média**. Uma instância de aplicação e um Postgres comuns cobrem isso. **Não entram:** load balancer, sharding, CDN, data warehouse, cache. As imagens das notas são privadas (URL assinada, sem CDN), e o volume por usuário é de KB a MB.

**Primeiro passo real, antes de qualquer nuvem:** corrigir a persistência local (falhas 1 e 2) e adicionar log ao backend. Sincronizar dados que podem ser truncados em silêncio só espalha o problema.

## 12. Como contar isso em entrevista

1. **Comece pelos requisitos e pelo que ficou de fora**, não pelos componentes.
2. **Dê números:** 1 usuário, KB a MB, 1 tick por segundo. "Não precisa de fila nem de cache, e eu sei dizer por quê."
3. **Fronteiras:** UI sem regra de negócio; backend dono do estado e do tempo; snapshots.
4. **Pureza:** timer e decisão de sincronia sem I/O, por isso testáveis.
5. **Falhas:** tabela de falha, efeito, lacuna. Assuma o que está aberto: "perco dados se o processo morrer durante a escrita; já resolvi nas notas e falta nas tarefas".
6. **Decisão com alternativa e custo**, como o serviço em outro processo.
7. **Evolução com cálculo**, não com sigla.

## Como foi levantado e o que falta

Li `lib.rs`, `state.rs`, `commands.rs` (comandos, `apply`, caminhos de gravação), `config.rs`, `tracker/{tasks,timer,activity,mod}.rs` (incluindo `tick`), `notes.rs`, `google_sync.rs`, `github.rs`, `activity_tracking/client.rs` e, no serviço, `storage.rs`, `api.rs`, `app.rs`, `recorder.rs`, `collector.rs`, além de `lib/tauri.ts` e `widget/hooks.ts`. **Não li** `widget.rs`, `media.rs`, `alerts.rs` e `google_calendar.rs` por inteiro. Não rodei o app, e **não reproduzi** a perda de dados da falha 1: é consequência lida do código. Os 240 testes foram contados por `#[test]`, não executados. Os números de atividade por app (linhas no SQLite) são estimativa.
