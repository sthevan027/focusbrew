# Captura por voz e entrada externa — Plano de implementação

> **Estado (31/10/2026): ADIADO.** Dois validadores independentes (engenheiro sênior e CEO) recomendaram não construir tudo agora, e o Sthevan aprovou o caminho enxuto. Em execução: `docs/superpowers/plans/2026-10-31-captura-por-voz-enxuta.md` (F0 e a caixa de captura). Este plano completo guarda as fases F2 e F3 como referência, só para depois do gate de 30 dias: captura usada ≥ 5 itens por dia útil, ≥ 90% interpretados certo, ≥ 1 sinal externo, e o Notetaker do Wispr rodando no Windows. Mudanças já pedidas pelos validadores para quando F2/F3 voltarem: não criar `TaskSource::External` (usar só `external_ref` opcional), cortar porta e token, filtrar reuniões compartilhadas, guardar `processed/` e `rejected/` por tempo limitado.

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam `- [ ]`.

**Objetivo:** o Focus Brew ganha uma caixa de captura por atalho (ditado do Wispr vira tarefa, nota ou ajuste de tempo) e uma entrada externa segura (porta local + pasta de entrega) que alimenta uma caixa de sugestões, tudo desligado por padrão.

**Arquitetura:** o app continua o único a gravar. A voz grava direto só pela caixa de captura (com pré-visualização e Enter); tudo que vem de fora cai em `inbox.json` e só vira tarefa/nota quando a pessoa aceita, usando os caminhos de gravação que já existem. A lógica fica em funções puras testáveis (`parse_capture`, `decide_ingest`) dentro de um módulo novo `src-tauri/src/integration/`.

**Stack:** Rust (Tauri v2, `axum` 0.7 como no serviço de atividade, `tokio`, `keyring`, `tracing`), React 19 + TypeScript, vitest. Gerenciador JS: **Bun**.

**Spec:** `docs/superpowers/specs/2026-10-31-captura-por-voz-e-entrada-externa-design.md` (ler inteiro, inclusive a §12).

## Global Constraints

- Integração **desligada por padrão**; desligada, não roda servidor, não lê a pasta de entrega, não registra o atalho e nenhum código novo executa. Os 240 `#[test]` atuais de `src-tauri` seguem passando em toda tarefa.
- Escuta só em `127.0.0.1`, **porta padrão 8766**, token obrigatório, corpo máximo **64 KB**, até **100 itens** por pedido.
- Limites que já existem: título **200** caracteres, nota **20.000** caracteres, **1.000** notas, minutos **5..=180**.
- Sugestões vencem em **7 dias** (aviso no 5º dia); histórico de sugestões resolvidas guardado **90 dias**; livro de descartes limitado a **5.000** chaves (descarta as mais antigas).
- Semelhança de itens da mesma reunião: sobreposição de palavras **≥ 0,8**.
- Token no `keyring` (serviço `focusbrew`, conta `integration-token`). Logs **nunca** contêm texto de tarefas, notas ou reuniões; só ids, contagens e erros.
- Comandos: Rust `cargo test --manifest-path src-tauri/Cargo.toml <filtro>`; front `bunx vitest run <arquivo>` e `bunx tsc --noEmit`. Não usar npm/pnpm.
- Um branch e um PR por fase, a partir de `dev`. Commits terminam com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Nomes de código em inglês e genéricos (nada de "wispr" no código, salvo `external_ref.source`); textos da interface em português.
- Escolha deste plano (marcada como minha): atalho de captura padrão `CommandOrControl+Alt+KeyJ`.

## Review Focus

Entradas que o spec implica e nenhuma tarefa exercitaria por padrão; cada uma tem seu teste na tarefa dona.

1. **Ditado do Wispr vem pontuado e com maiúscula** ("Tarefa: revisar o PR.", "Tarefa, revisar…"): a palavra-chave ainda é reconhecida e o ponto final some do título (T4).
2. **`tasks.json` de quem já usa o app** não tem `external_ref` nem `source = external`: continua abrindo (T10).
3. **Pedido inválido ou enorme** (JSON quebrado, 65 KB, 101 itens, token errado, `Host` estranho): resposta 4xx e nada ingerido (T12).
4. **Porta ocupada ou atalho tomado por outro programa ao ligar**: a integração fica desligada, a configuração não muda e a tela diz o motivo (T14).
5. **Arquivo da pasta processado duas vezes** (queda entre ingerir e mover): o dedupe impede sugestão duplicada (T13).

## Estrutura de arquivos

Criar (Rust, `src-tauri/src/`): `fsutil.rs` · `logging.rs` · `capture_window.rs` · `integration/mod.rs` (estado, ligar/desligar, `Rollback`) · `integration/capture.rs` (`parse_capture`) · `integration/ingest.rs` (`ExternalRef`, `decide_ingest`) · `integration/inbox.rs` (armazenamento) · `integration/token.rs` · `integration/server.rs` · `integration/drop_folder.rs` · `integration/commands.rs` · `integration/testdata/normalize.json`.
Criar (front, `src/`): `CaptureWindow.tsx` · `lib/capture.ts` · `settings/IntegrationsSection.tsx` · `widget/SuggestionsTab.tsx` (vira `MeetingsTab.tsx` na T17).
Criar (`tools/focusbrew-inbox/`): `SKILL.md` · `send.ts` · `send.test.ts`.
Modificar: `config.rs`, `shortcuts.rs`, `lib.rs`, `commands.rs` (só registro), `state.rs`, `tracker/tasks.rs`, `tracker/activity.rs`, `google_sync.rs`, `notes.rs` (só reutilizar), `Cargo.toml`, `capabilities/default.json`, `src/main.tsx`, `src/App.tsx`, `src/lib/tauri.ts`, `src/lib/types.ts`, `README.md`.

## Mapa de execução

```
Onda 1 (em paralelo, arquivos novos): T1 fsutil · T2 logging · T4 parse_capture · T8 ingest · T11 token
F0:  T1 → T3 (usa T1 e T2)
F1:  T4 → T5 → T6 → T7        (T5 só depois de F0 mesclada)
F2:  T8,T9 → T10 → T12,T13 → T14 → T15      (T11 antes de T12 e T14)
F3:  T16 → T17 ;  T18 ;  T19 (por último)
```

Quem for da Onda 1 só cria o próprio arquivo e uma linha `pub mod x;`; edições em `lib.rs` e `commands.rs` ficam só em T6, T14 (um agente por vez).

---

# Fase 0 — Robustez e logs (branch `feat/escrita-atomica-e-logs`)

### Task 1: Gravação atômica e quarentena

**Files:** Create `src-tauri/src/fsutil.rs`; Modify `src-tauri/src/lib.rs` (só `mod fsutil;`).

**Interfaces — Produces:**
`pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()>` (cria a pasta, grava `<nome>.tmp`, `rename`) ·
`pub fn quarantine(path: &Path, stamp_ms: i64) -> io::Result<PathBuf>` (move para `<stem>.corrupt-<stamp>.json`, nunca sobrescreve: se existir, acrescenta `-1`, `-2`…).

- [ ] **Step 1: testes** em `fsutil.rs` (pasta `std::env::temp_dir().join(uuid)`):
  `write_atomic_replaces_whole_file` (grava "a", depois "bb" → lê "bb", nenhum `.tmp` sobra) ·
  `write_atomic_creates_missing_parent` ·
  `quarantine_moves_and_never_overwrites` (duas chamadas com o mesmo stamp → dois arquivos distintos, original ausente).
- [ ] **Step 2:** `cargo test --manifest-path src-tauri/Cargo.toml fsutil` → FALHA (módulo ausente).
- [ ] **Step 3:** implementar as duas funções.
- [ ] **Step 4:** mesmo comando → PASSA.
- [ ] **Step 5:** commit `feat: gravação atômica e quarentena de arquivos`.

### Task 2: Logs no backend

**Files:** Create `src-tauri/src/logging.rs`; Modify `Cargo.toml` (`tracing = "0.1"`, `tracing-subscriber = "0.3"`, `tracing-appender = "0.2"`), `lib.rs` (chamar `logging::init()` no início de `run`, guardar o guard).

**Interfaces — Produces:**
`pub fn init_in(dir: &Path) -> Result<WorkerGuard, String>` (arquivo diário, 7 arquivos, nível por `FOCUSBREW_LOG`, padrão `info`) ·
`pub fn init() -> Option<WorkerGuard>` (usa `config::local_data_dir().join("logs")`; falha vira `None`, nunca derruba o app) ·
`pub fn log_io(what: &str, result: io::Result<()>)` (erro → `tracing::error!`, só com `what` e a mensagem do erro).

- [ ] **Step 1: testes:** `init_in_writes_a_line_to_a_file` (emite `tracing::info!("hello")`, solta o guard, a pasta tem um arquivo contendo "hello") · `log_io_ok_is_silent_and_err_does_not_panic`.
- [ ] **Step 2:** `cargo test ... logging` → FALHA.
- [ ] **Step 3:** implementar; adicionar também `config::local_data_dir() -> PathBuf` (`ProjectDirs::data_local_dir()`, cria a pasta), usada por toda a integração para tokens, logs e pasta de entrega (o `data_dir()` atual fica em Roaming).
- [ ] **Step 4:** `cargo test ... logging` e `... config` → PASSAM.
- [ ] **Step 5:** commit `feat: logs em arquivo no backend`.

### Task 3: Escrita atômica e carga segura de tasks, activity e settings

**Files:** Modify `tracker/tasks.rs`, `tracker/activity.rs`, `config.rs`, `state.rs` (`save_tracker`), `commands.rs`/`lib.rs` (os `let _ = ...save(...)` viram `logging::log_io`).

**Interfaces — Consumes:** T1 `write_atomic`, `quarantine`; T2 `log_io`. **Produces:**
`tasks::load_from(path: &Path, stamp_ms: i64) -> Vec<Task>` · `activity::load_from(path: &Path, stamp_ms: i64) -> ActivityLog` (usar o tipo real do arquivo) · `config::load_from(path: &Path, stamp_ms: i64) -> AppConfig`. Regra comum: arquivo ausente ou só espaços → vazio/padrão; ilegível → quarentena + `tracing::error!` + vazio/padrão; **nunca** devolve vazio em silêncio por erro de leitura, e **nunca** regrava por cima de um arquivo que não conseguiu ler.

- [ ] **Step 1: testes** (um por arquivo, mais os existentes intactos): `corrupt_tasks_file_is_quarantined_not_erased` (arquivo `{"x"`; após `load_from` o original some, existe `tasks.corrupt-<stamp>.json` com o mesmo conteúdo, retorno vazio) · `missing_file_is_empty_without_quarantine` · `save_leaves_no_tmp_and_is_valid_json` · idem para activity e config.
- [ ] **Step 2:** `cargo test ... tasks` / `... activity` / `... config` → FALHA.
- [ ] **Step 3:** trocar `fs::write` por `fsutil::write_atomic` nas três `save`; criar os `load_from` e fazer `load()` chamá-los; `parse` atual continua existindo para os testes de arquivo antigo.
- [ ] **Step 4:** `cargo test --manifest-path src-tauri/Cargo.toml` (suíte inteira) → PASSA, 240+ testes.
- [ ] **Step 5:** commit `fix: gravação atômica e carga segura de tarefas, atividade e configurações`; abrir PR para `dev`.

---

# Fase 1 — Caixa de captura (branch `feat/captura-por-voz`)

### Task 4: Interpretador `parse_capture` (pode começar já)

**Files:** Create `src-tauri/src/integration/mod.rs` (`pub mod capture;`), `integration/capture.rs`.

**Interfaces — Produces:**
```rust
pub enum Parsed {
    Task { title: String, project: Option<String>, minutes: Option<u32>, day: Option<String> },
    Note { text: String },
    SetMinutes { minutes: u32 },
    Unknown { text: String },
}
pub fn parse_capture(input: &str, today: &str) -> Parsed
```
Regras: primeira palavra, sem acento/caixa e sem pontuação colada, em `tarefa|task|atividade` / `nota|note` / `tempo|time`; separador opcional (`:` `,` `-`). Em tarefa: extrair no fim `tempo N` (também `N min`, `N minutos`, `N hora(s)` = 60·N), depois `hoje`/`amanhã`/`amanha`/`AAAA-MM-DD` → `day` (relativo a `today`), depois `split_project` de `tracker::tasks`; título limpo por `clean_title`; ponto/vírgula finais removidos. `tempo N` sozinho → `SetMinutes`. Texto vazio, só palavra-chave, ou título vazio → `Unknown`. Nota acima de 20.000 caracteres → `Unknown`.

- [ ] **Step 1: testes por tabela** (spec: valores exatos):
  `"tarefa revisar PR #focusbrew, tempo 40"` → Task{title:"revisar PR", project:Some("focusbrew"), minutes:Some(40), day:None} ·
  `"Tarefa: revisar o PR."` e `"Tarefa, revisar o PR"` → title `"revisar o PR"` (Review Focus 1) ·
  `"task fix login amanhã"` com today `"2026-10-31"` → day `Some("2026-11-01")` ·
  `"nota ligar pro cliente na segunda"` → Note{text:"ligar pro cliente na segunda"} ·
  `"tempo 40"`, `"Tempo 1 hora"` → SetMinutes 40 / 60 · `"tempo 4"` → SetMinutes 4 (o clamp é do chamador) ·
  `""`, `"   "`, `"tarefa"`, `"bom dia"` → Unknown · nota de 20.001 caracteres → Unknown.
- [ ] **Step 2:** `cargo test ... integration::capture` → FALHA.
- [ ] **Step 3:** implementar sem IA e sem regex pesada; normalização de acentos por mapeamento simples.
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: interpretador de captura por voz`.

### Task 5: Configurações e quarto atalho global

**Files:** Modify `config.rs`, `shortcuts.rs`, `src/lib/types.ts`.

**Interfaces — Produces:** campos em `AppConfig` (e no `Default`): `integration_enabled: bool = false`, `integration_port: u16 = 8766`, `shortcut_capture: String = "CommandOrControl+Alt+KeyJ"`, `capture_clipboard_prefill: bool = false`; `normalized()` limita a porta a `1024..=65535`. `shortcuts::Action::Capture` (slot 3, `Slots` passa a `[Option<Shortcut>; 4]`) · `pub fn clear(app: &AppHandle, action: Action)` (desregistra e limpa o slot) · `check_conflict` contra os outros três. Espelhar os campos em `types.ts`.

- [ ] **Step 1: testes:** `new_integration_fields_default_off` · `an_old_settings_file_loads_with_integration_defaults` · `port_is_clamped` · `find_action_knows_the_capture_slot` · `the_four_actions_use_four_distinct_slots` · `capture_shortcut_cannot_equal_another` (reescrever os testes de 3 slots que dependem do tamanho).
- [ ] **Step 2:** `cargo test ... config` e `... shortcuts` → FALHA.
- [ ] **Step 3:** implementar. `update_settings` preserva `integration_enabled`, `integration_port` e `shortcut_capture` do estado (como já faz com os atalhos).
- [ ] **Step 4:** PASSA + suíte inteira.
- [ ] **Step 5:** commit `feat: configurações e atalho da caixa de captura`.

### Task 6: Janela de captura, comandos e ligar/desligar

**Files:** Create `capture_window.rs`, `integration/commands.rs`; Modify `integration/mod.rs`, `lib.rs` (módulos, `invoke_handler`, tratador do atalho em `Action::Capture`, `.manage(IntegrationShared)`), `commands.rs` (só registro se necessário), `capabilities/default.json` (`"capture"` em `windows`).

**Interfaces — Consumes:** T4, T5. **Produces:**
`capture_window::open(app: &AppHandle)` (janela `capture`, ~560×200, centrada no monitor do cursor, copiando o padrão de `note_window.rs`; fora da thread do evento do atalho, como o `note_action`) ·
`pub struct Rollback` com `fn push(&mut self, undo: impl FnOnce() + 'static)`, `fn commit(self)`; solta sem `commit` → executa os `undo` em ordem inversa ·
`integration::set_enabled(app: &AppHandle, enabled: bool) -> Result<IntegrationStatus, String>` (nesta fase: registra/limpa o atalho de captura; qualquer falha desfaz tudo, não altera `config` e devolve a mensagem) ·
comandos `#[tauri::command]`: `capture_preview(text) -> CapturePreview` (serializa `Parsed` + alvo de tempo resolvido), `capture_commit(item: CaptureItem) -> Result<StateSnapshot, String>`, `open_capture()`, `set_integration_enabled(enabled) -> Result<StateSnapshot, String>`.
`pub fn resolve_minutes_target(open_today: &[(String, i64)], timer_task: Option<&str>) -> Target` com `Target::One(id) | Target::Pick(Vec<String>) | Target::None` — timer ativo → esse; senão uma só tarefa aberta hoje → ela; senão até 5 mais recentes (a mais nova primeiro) para escolher.

- [ ] **Step 1: testes:** `rollback_runs_undo_in_reverse_when_dropped` · `rollback_commit_skips_undo` · `target_prefers_running_timer` · `target_single_open_task` · `target_many_open_tasks_returns_five_newest_first` · `target_none_without_tasks` · `commit_task_uses_default_minutes_when_not_spoken` (função pura que monta `new_task` a partir de `CaptureItem::Task`) · `commit_note_adds_origin_line` (texto + `"\n\n— ditado, 31/10 12:40"`).
- [ ] **Step 2:** `cargo test ... integration` → FALHA.
- [ ] **Step 3:** implementar; `capture_commit` usa `apply()` / `add_task`-equivalente (com minutos explícitos via `tasks::new_task`), `set_task_minutes` e `NotesStore::upsert` + `notes::save` + evento `notes-changed`, e emite `state-changed` pelo `sync_ui` existente. Desligada, `capture_*` devolve erro "integração desligada" e o atalho não está registrado.
- [ ] **Step 4:** PASSA + suíte inteira.
- [ ] **Step 5:** commit `feat: caixa de captura por atalho`.

### Task 7: Interface da caixa de captura e da seção Integrações

**Files:** Create `src/CaptureWindow.tsx`, `src/lib/capture.ts`, `src/lib/capture.test.ts`, `src/settings/IntegrationsSection.tsx`; Modify `src/main.tsx` (rótulo `capture` → `<CaptureWindow/>`), `src/App.tsx` (nova seção "Integrações"), `src/lib/tauri.ts` (`capturePreview`, `captureCommit`, `openCapture`, `setIntegrationEnabled`).

**Interfaces — Produces (`capture.ts`):** `type CapturePreview` espelhando o Rust · `describePreview(p: CapturePreview): string` ("Tarefa · 40 min · #focusbrew · hoje") · `canCommit(p): boolean` (falso para `unknown`).

- [ ] **Step 1: testes (`capture.test.ts`):** `describePreview` para tarefa completa, nota e ajuste de tempo; `canCommit` falso para `unknown` e para `Pick` sem escolha.
- [ ] **Step 2:** `bunx vitest run src/lib/capture.test.ts` → FALHA.
- [ ] **Step 3:** implementar `capture.ts`; a janela: campo de texto com foco automático, pré-visualização viva (debounce 150 ms), Enter confirma, Esc fecha, `unknown` mostra o texto e os botões "Tarefa" e "Nota", `Pick` mostra a lista; se `capture_clipboard_prefill` estiver ligado, preenche com a área de transferência e deixa visível. A seção Integrações: interruptor (mensagem de erro do backend visível), campo do atalho (padrão de `GeneralSection`), interruptor da área de transferência.
- [ ] **Step 4:** `bunx vitest run src/lib/capture.test.ts` e `bunx tsc --noEmit` → PASSAM.
- [ ] **Step 5:** commit `feat: tela da caixa de captura e seção Integrações`; PR da fase para `dev`.

---

# Fase 2 — Sugestões, porta e pasta de entrega (branch `feat/entrada-externa`)

### Task 8: Identificador externo e `decide_ingest` (pode começar já)

**Files:** Create `integration/ingest.rs`, `integration/testdata/normalize.json`; Modify `integration/mod.rs`.

**Interfaces — Produces:**
```rust
pub struct ExternalRef { pub source: String, pub id: String }   // Serialize, Deserialize, Eq, Hash, Clone
pub fn normalize_title(s: &str) -> String      // minúsculas, sem acentos, sem pontuação, espaços únicos, 60 primeiros caracteres
pub fn item_key(meeting_id: &str, title: &str) -> String   // "<meeting_id>:<normalize_title>"
pub fn similar(a: &str, b: &str) -> bool       // sobreposição de palavras >= 0.8
pub struct Known<'a> { pub pending: &'a [ExternalRef], pub tasks: &'a [ExternalRef], pub dismissed: &'a [ExternalRef], pub processed_meetings: &'a [ExternalRef] }
pub enum Decision { Create, Ignore(IgnoreReason) }   // IgnoreReason: Pending, AlreadyTask, Dismissed, MeetingProcessed
pub fn decide_ingest(candidate: &ExternalRef, meeting: Option<&ExternalRef>, known: &Known, force: bool) -> Decision
```
- [ ] **Step 1: testes:** `normalize_title` com `testdata/normalize.json` (pares entrada → saída, incluindo acentos, pontuação e título de 80 caracteres cortado em 60; o mesmo arquivo será lido pelo teste em TypeScript da T18) · `reworded_item_of_same_meeting_is_ignored` ("Enviar proposta ao cliente" vs "enviar a proposta para o cliente" → `Ignore(Pending)`) · `different_meeting_same_title_creates` · `dismissed_key_is_ignored` · `processed_meeting_is_ignored_unless_forced` · `existing_task_is_ignored`.
- [ ] **Step 2:** `cargo test ... integration::ingest` → FALHA.
- [ ] **Step 3:** implementar (função pura; sem E/S).
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: identificador externo e decisão de ingestão`.

### Task 9: Armazenamento da caixa de sugestões

**Files:** Create `integration/inbox.rs`; Modify `integration/mod.rs`.

**Interfaces — Consumes:** T1, T8. **Produces:**
```rust
pub enum Kind { Task, Note }
pub enum State { Pending, Accepted, Dismissed, Expired }
pub struct Origin { pub label: String, pub date: String, pub reference: String }
pub struct Suggestion { pub id: String, pub kind: Kind, pub title: String, pub text: String, pub minutes: Option<u32>,
    pub day: Option<String>, pub project: Option<String>, pub external_ref: ExternalRef, pub origin: Origin,
    pub created_ms: i64, pub expires_ms: i64, pub state: State, pub task_id: Option<String> }
pub struct InboxStore { pub suggestions: Vec<Suggestion>, pub dismissed: Vec<ExternalRef>, pub processed_meetings: Vec<ExternalRef>, pub status: LoadStatus }
impl InboxStore {
  pub fn ingest(&mut self, items: Vec<Incoming>, tasks: &[ExternalRef], now_ms: i64, force: bool) -> IngestReport // {created, duplicates, rejected: Vec<(usize,String)>}
  pub fn dismiss(&mut self, id: &str, now_ms: i64) -> bool
  pub fn mark_accepted(&mut self, id: &str, task_id: Option<String>) -> bool
  pub fn add_dismissed_key(&mut self, r: ExternalRef)   // limite 5.000
  pub fn sweep(&mut self, now_ms: i64) -> SweepReport   // vence >7 dias, apaga resolvidas >90 dias; nunca apaga pendente
  pub fn pending_count(&self) -> usize
}
pub fn load_from(path: &Path, stamp_ms: i64) -> InboxStore ; pub fn save_to(path: &Path, s: &InboxStore) -> io::Result<()> ; pub fn restore_quarantine(dir: &Path, s: &mut InboxStore) -> usize
```
Arquivo `inbox.json` (`{version:1,…}`) em `config::local_data_dir()`; cada `save_to` guarda a geração anterior em `inbox.prev.json`; `load_from` corrompido → quarentena e carrega `inbox.prev.json` (se existir) com `LoadStatus::Recovered`; senão vazio com aviso.

- [ ] **Step 1: testes:** `ingest_validates_limits` (título 201 → rejeitado com motivo; nota 20.001 rejeitada; `kind` inválido rejeitado) · `ingest_twice_does_not_duplicate` · `sweep_expires_after_7_days_and_keeps_pending_otherwise` · `sweep_purges_resolved_after_90_days` · `dismissed_ledger_is_capped_at_5000_dropping_oldest` · `corrupt_inbox_falls_back_to_previous_generation` · `corrupt_inbox_without_previous_starts_empty_and_reports` · `restore_quarantine_reingests_valid_items_without_duplicates`.
- [ ] **Step 2:** `cargo test ... integration::inbox` → FALHA.
- [ ] **Step 3:** implementar usando `decide_ingest`; relógio sempre por parâmetro.
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: armazenamento atômico da caixa de sugestões`.

### Task 10: `external_ref` nas tarefas e aceitar/descartar

**Files:** Modify `tracker/tasks.rs`, `google_sync.rs`, `commands.rs` (apenas o `remove_task`), `integration/commands.rs`, `lib.rs` (`.manage(InboxShared)`, registro), `src/lib/types.ts`, `src/lib/tauri.ts`.

**Interfaces — Produces:** `Task.external_ref: Option<ExternalRef>` com `#[serde(default)]`; `TaskSource::External` (`"external"`), tratado como `Manual` em `google_sync` (inclusive empurrar para a Agenda) e em todos os `match` existentes (`grep -rn "TaskSource::" src-tauri/src`); espelhar em `types.ts`. Comandos: `accept_suggestion(id) -> Result<StateSnapshot, String>` · `dismiss_suggestion(id) -> Result<(), String>` · `list_suggestions() -> Vec<Suggestion>`. `InboxShared(Mutex<InboxStore>)`. **Ordem de travas:** nunca segurar `Shared` e `InboxShared` juntos; **primeiro grava a tarefa/nota (atômico), depois marca a sugestão** — se cair no meio, aceitar de novo é idempotente. `remove_task` de tarefa com `external_ref` acrescenta a chave ao livro de descartes.

- [ ] **Step 1: testes:** `old_tasks_file_without_external_ref_still_loads` (arquivo real de 0.7 sem os campos novos; Review Focus 2) · `external_source_serializes_as_external` · `external_task_syncs_like_manual` (`google_sync::decide` com `TaskSource::External` devolve o mesmo que `Manual`) · `accept_task_suggestion_creates_task_with_external_source_and_default_minutes` · `accept_twice_creates_one_task` · `accept_note_creates_new_note_with_origin_line` · `deleting_an_accepted_task_blocks_its_return` (chave no livro; nova ingestão → `Ignore(Dismissed)`).
- [ ] **Step 2:** `cargo test ... tasks`, `... google_sync`, `... integration::commands` → FALHA.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASSA + suíte inteira + `bunx tsc --noEmit`.
- [ ] **Step 5:** commit `feat: sugestões aceitas viram tarefas e notas com origem externa`.

### Task 11: Token da integração (pode começar já)

**Files:** Create `integration/token.rs`; Modify `Cargo.toml` (`getrandom = "0.2"`, `subtle = "2"`), `integration/mod.rs`.

**Interfaces — Produces:** `pub fn generate() -> String` (32 bytes aleatórios em hex) · `pub fn load_or_create() -> Result<String, String>` (keyring `focusbrew` / `integration-token`) · `pub fn regenerate() -> Result<String, String>` · `pub fn write_token_file(token: &str) -> Result<(), String>` (`config::local_data_dir()/integration-token`) · `pub fn acl_args(path: &Path, user: &str) -> Vec<String>` (argumentos do `icacls`: `/inheritance:r`, `/grant:r`, `<user>:F`) · `pub fn matches(expected: &str, given: &str) -> bool` (tempo constante via `subtle`).

- [ ] **Step 1: testes:** `generate_is_64_hex_chars_and_unique` · `matches_is_true_only_for_equal_tokens` (inclui vazio e comprimentos diferentes) · `acl_args_restrict_to_the_user` (contém `/inheritance:r` e `/grant:r` com o usuário e nenhum "Everyone"/"Users").
- [ ] **Step 2:** `cargo test ... integration::token` → FALHA.
- [ ] **Step 3:** implementar; `write_token_file` grava com `write_atomic` e chama `icacls` com `acl_args` (erro vira `Err` e log, sem derrubar nada).
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: token da integração no keyring e arquivo restrito`.

### Task 12: Servidor local

**Files:** Create `integration/server.rs`; Modify `Cargo.toml` (`axum = "0.7"`, `tokio` ganha `"net"` e `"sync"`, dev-dep `tower = { version = "0.4", features = ["util"] }`).

**Interfaces — Consumes:** T9, T11. **Produces:**
`pub fn build_router(ctx: ServerCtx) -> Router` · `pub struct ServerHandle` com `pub async fn stop(self)` · `pub async fn start(port: u16, ctx: ServerCtx) -> Result<ServerHandle, String>` (porta ocupada → `Err("porta 8766 já está em uso")`, bind em `127.0.0.1`).
`ServerCtx` guarda token esperado, `AppHandle`/acesso ao `InboxShared` e às tarefas (para o dedupe) e um limitador (60 pedidos/min).
Rotas: `GET /v1/health` → 200 `{"ok":true,"version":"<app>"}` · `POST /v1/inbox` corpo `{"items":[{"kind":"task"|"note","title"?,"text"?,"minutes"?,"day"?,"project"?,"external_ref":{"source","id"},"origin":{"label","date","reference"}}]}` → 200 `{"created":n,"duplicates":n,"rejected":[{"index":i,"reason":"…"}]}`. Sempre `Authorization: Bearer <token>`; `Host` precisa começar com `127.0.0.1` ou `localhost`; sem CORS; emite o evento `inbox-changed` quando cria algo.

- [ ] **Step 1: testes** com `tower::ServiceExt::oneshot`: `health_requires_token` (sem header 401; token errado 401; correto 200) · `foreign_host_is_forbidden` (403) · `invalid_json_is_400_and_ingests_nothing` · `body_over_64kb_is_413` · `more_than_100_items_is_400` · `valid_post_creates_suggestions_and_second_post_reports_duplicates` · `rate_limit_returns_429_after_60_requests` · `start_on_busy_port_returns_clear_error` (ocupa a porta com um `TcpListener` e chama `start`).
- [ ] **Step 2:** `cargo test ... integration::server` → FALHA.
- [ ] **Step 3:** implementar com `DefaultBodyLimit::max(64 * 1024)`; a lógica de ingestão chama `InboxStore::ingest` (não duplicar regras no handler).
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: servidor local da integração com token`.

### Task 13: Pasta de entrega

**Files:** Create `integration/drop_folder.rs`; Modify `integration/mod.rs`.

**Interfaces — Consumes:** T9. **Produces:** `pub fn drop_dir() -> PathBuf` (`config::local_data_dir()/inbox-drop`) · `pub fn count_waiting(dir: &Path) -> usize` (só conta `*.json` na raiz) · `pub fn ingest_dir(dir: &Path, store: &mut InboxStore, tasks: &[ExternalRef], now_ms: i64) -> DropReport` — cada arquivo tem o mesmo corpo do `POST /v1/inbox`; válido → `processed/`, inválido/grande (>64 KB)/ilegível → `rejected/` com `<nome>.reason.txt`; arquivo com mais de 7 dias → `rejected/` (vencido).

- [ ] **Step 1: testes:** `valid_file_is_ingested_and_moved_to_processed` · `invalid_json_goes_to_rejected_with_reason` · `file_over_64kb_goes_to_rejected` · `old_file_is_expired_into_rejected` · `same_file_content_processed_twice_creates_one_suggestion` (copia o arquivo de volta para a raiz e reprocessa; Review Focus 5) · `count_waiting_ignores_subfolders`.
- [ ] **Step 2:** `cargo test ... integration::drop_folder` → FALHA.
- [ ] **Step 3:** implementar; ordem segura: ingerir e salvar o `inbox.json` **antes** de mover o arquivo.
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: pasta de entrega para pedidos com o app fechado`.

### Task 14: Ligar a integração inteira e a fila de leitura

**Files:** Modify `integration/mod.rs`, `integration/commands.rs`, `lib.rs` (laço de 30 s que só roda ligado; encerramento do servidor ao sair).

**Interfaces — Consumes:** T6 (`set_enabled`, `Rollback`), T11, T12, T13. **Produces:** `set_enabled(true)` agora: garante token + arquivo do token → registra o atalho → sobe o servidor → lê a pasta de entrega → `sweep`; **qualquer falha desfaz tudo, mantém `integration_enabled = false` e devolve o motivo** ("porta 8766 já está em uso", "Ctrl+Alt+J já é usado por outro programa"). `set_enabled(false)` para o servidor, limpa o atalho e para o laço. Comandos: `integration_status() -> IntegrationStatus { enabled, server_running, port, error, pending_suggestions, waiting_files }` (`waiting_files` conta a pasta mesmo desligada, só quando chamado) · `regenerate_integration_token() -> Result<String,String>` · `get_integration_token() -> Result<String,String>` · `restore_inbox_quarantine() -> Result<usize,String>`.

- [ ] **Step 1: testes** (com doubles injetados nos passos de `set_enabled`, via `Rollback`): `enable_failure_on_port_rolls_back_shortcut_and_keeps_config_off` (Review Focus 4) · `enable_failure_on_shortcut_stops_nothing_else_running` · `disable_stops_everything_and_is_idempotent` · `status_reports_waiting_files_when_off`.
- [ ] **Step 2:** `cargo test ... integration` → FALHA.
- [ ] **Step 3:** implementar; persistir `config.integration_enabled` só depois de tudo ter dado certo.
- [ ] **Step 4:** PASSA + suíte inteira.
- [ ] **Step 5:** commit `feat: ligar e desligar a integração com reversão completa`.

### Task 15: Interface das sugestões e da integração completa

**Files:** Create `src/widget/SuggestionsTab.tsx`, `src/lib/suggestions.ts`, `src/lib/suggestions.test.ts`; Modify `src/settings/IntegrationsSection.tsx`, `src/widget/Panel.tsx` (nova aba "Sugestões" com contador), `src/lib/tauri.ts`, `src/lib/types.ts`.

**Interfaces — Produces (`suggestions.ts`):** `type Suggestion` espelhando o Rust · `daysLeft(s: Suggestion, nowMs: number): number` · `isExpiringSoon(s, nowMs): boolean` (verdadeiro do 5º dia em diante) · `groupByOrigin(list: Suggestion[]): { reference: string; label: string; date: string; items: Suggestion[] }[]`.

- [ ] **Step 1: testes:** `daysLeft` e `isExpiringSoon` nos limites (dia 4, 5, 7) · `groupByOrigin` agrupa por `reference`, mantém ordem por data decrescente.
- [ ] **Step 2:** `bunx vitest run src/lib/suggestions.test.ts` → FALHA.
- [ ] **Step 3:** implementar; a aba lista pendentes com Aceitar/Descartar, aviso "vence em N dias" e contador no cabeçalho da aba; Integrações ganha porta, token (mostrar/copiar/regenerar), estado do servidor, "N pedidos aguardando na pasta; ligue a integração" e botão "Restaurar da quarentena".
- [ ] **Step 4:** `bunx vitest run` e `bunx tsc --noEmit` → PASSAM.
- [ ] **Step 5:** commit `feat: aba de sugestões e tela completa de Integrações`; PR da fase.

---

# Fase 3 — Reuniões e skill (branch `feat/reunioes`)

### Task 16: Histórico de reuniões e reprocessar

**Files:** Modify `integration/inbox.rs`, `integration/commands.rs`.

**Interfaces — Produces:** `pub struct MeetingView { reference: String, label: String, date: String, pending: u32, accepted: u32, dismissed: u32, expired: u32 }` · `InboxStore::meetings(&self) -> Vec<MeetingView>` (derivado das sugestões; some junto com a limpeza de 90 dias) · `InboxStore::reprocess(&mut self, reference: &str)` (tira a reunião de `processed_meetings`) · comandos `list_meetings()` e `reprocess_meeting(reference)`.

- [ ] **Step 1: testes:** `meetings_aggregate_states_per_reference` · `meeting_disappears_with_its_last_suggestion_after_90_days` · `reprocess_allows_the_same_meeting_again`.
- [ ] **Step 2:** `cargo test ... integration::inbox` → FALHA.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: histórico de reuniões e reprocessamento`.

### Task 17: Aba Reuniões

**Files:** Rename `src/widget/SuggestionsTab.tsx` → `MeetingsTab.tsx`; Modify `Panel.tsx`, `src/lib/tauri.ts`.

- [ ] **Step 1: teste** em `suggestions.test.ts`: `groupByOrigin` com sugestões já resolvidas mantém o grupo e conta os estados.
- [ ] **Step 2:** `bunx vitest run src/lib/suggestions.test.ts` → FALHA.
- [ ] **Step 3:** aba "Reuniões": uma seção por reunião (título, data, contagens), sugestões dentro de cada, botão "Reprocessar"; só o que o Claude enviou; nenhuma transcrição.
- [ ] **Step 4:** `bunx vitest run` e `bunx tsc --noEmit` → PASSAM.
- [ ] **Step 5:** commit `feat: aba Reuniões agrupada por reunião`.

### Task 18: Skill de exemplo e script de envio

**Files:** Create `tools/focusbrew-inbox/SKILL.md`, `tools/focusbrew-inbox/send.ts`, `tools/focusbrew-inbox/send.test.ts`.

**Interfaces — Produces (`send.ts`):**
`normalizeTitle(s: string): string` (mesmo resultado de `integration/testdata/normalize.json`) · `buildItem(meeting: {id; title; startIso}, itemTitle: string, tz: string): Incoming` · `toLocalDay(iso: string, tz: string): string` (UTC → dia local `AAAA-MM-DD`) · `chooseRoute(health: { ok: boolean } | "refused"): "port" | "drop"` · `async function send(items: Incoming[], opts): Promise<{ route: "port" | "drop"; detail: string }>` (lê `FOCUSBREW_TOKEN` ou o arquivo `integration-token`; sem token, para e avisa sem gravar na pasta; porta recusada → um arquivo `<uuid>.json` em `inbox-drop`).
`SKILL.md` (Claude Code no mesmo PC): como buscar a reunião pelo conector do Wispr, separar o que é do usuário, converter horários e chamar `send`.

- [ ] **Step 1: testes (`send.test.ts`):** `normalizeTitle` lê o JSON compartilhado e confere cada par · `toLocalDay("2026-10-31T02:30:00Z","America/Sao_Paulo")` → `"2026-10-30"` · `chooseRoute("refused")` → `"drop"` · `send` sem token não escreve arquivo e devolve erro · `send` com porta recusada escreve um `.json` válido na pasta (pasta temporária injetada) · `send` com servidor falso em 200 usa `"port"`.
- [ ] **Step 2:** `bunx vitest run tools/focusbrew-inbox/send.test.ts` → FALHA.
- [ ] **Step 3:** implementar; não instalar a skill na máquina (só sob pedido do Sthevan).
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: skill de exemplo e script de envio para a caixa de sugestões`.

### Task 19: README e verificação ponta a ponta

**Files:** Modify `README.md`; sem código de produto.

- [ ] **Step 1:** seção curta no README: o que a integração faz, desligada por padrão, o que é guardado (nunca a transcrição), como instalar a skill de exemplo.
- [ ] **Step 2: verificação manual e registro dos resultados na descrição do PR** (com o app instalado/rodando, integração ligada): (a) ditar "tarefa … tempo 40" pelo Wispr na caixa de captura e confirmar o tempo ≤ 5 s (S1); (b) chamar uma ferramenta real do Wispr para listar reuniões e **anotar os nomes reais das ferramentas** no `SKILL.md`; (c) enviar a mesma reunião duas vezes e ver zero duplicatas (S2); (d) fechar o app, enviar, abrir e ver os pedidos na aba (S4); (e) desligar a integração, conferir que a porta fecha e o atalho some (S3); (f) rodar `cargo test` e `bunx vitest run` completos.
- [ ] **Step 3:** commit `docs: README da integração`; PR da fase.

---

## Autoavaliação

**Cobertura do spec:** S1 → T6/T7/T19(a) · S2 → T8, T9, T13, T19(c) · S3 → T14, T19(e) e a regra global dos 240 testes · S4 → T9, T13, T15, T19(d) · §4.1 → T4, T6, T7 · §4.2 → T9, T10, T15–T17 · §4.3 → T11–T14 · §4.4 → T8–T10 · §4.5 → T18 · §5 → T1–T3 · §6 (falhas) → T3, T9, T12–T14 · §7 → T11, T12 · §12 → T3 (`local_data_dir`), T5 (serde default/config), T6–T7 (clipboard opcional), T10 (`External`), T12 (porta só `task`/`note`), T16 (90 dias), T18 (fuso), T14 (ligar sem reiniciar), T19 (README). Correção ao spec: as pastas de dados usam `config::local_data_dir()` (Local, fora do Roaming), não `data_dir()`.

**Consistência de tipos:** `ExternalRef` (T8) é o mesmo em `Task` (T10), `Suggestion` (T9) e `Known` (T8); `Incoming` (T9) é o corpo do `POST` (T12) e dos arquivos (T13) e o que `send.ts` produz (T18); `Origin.reference` aparece como `origin.reference` no JSON; `Action::Capture` (T5) é o slot registrado por `set_enabled` (T6, T14).

**Proporção:** o plano traz assinaturas, nomes de teste e valores do spec; os corpos ficam para quem implementa.
