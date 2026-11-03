# Captura por voz (versão enxuta) — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development para executar este plano tarefa a tarefa. Os passos usam `- [ ]`.

**Objetivo:** gravação segura dos dados (F0) e uma caixa de captura por atalho onde o ditado do Wispr vira tarefa, nota ou ajuste de tempo, com pré-visualização e Enter (F1 enxuta). Tudo desligado por padrão.

**Arquitetura:** o app continua o único a gravar. A captura passa por um interpretador puro (`parse_capture`) e grava pelos caminhos que já existem (`tasks::new_task` via `apply`, `set_minutes`, `NotesStore::upsert`). Nada de porta, token, caixa de sugestões ou `external_ref` nesta versão.

**Stack:** Rust (Tauri v2, `tracing`), React 19 + TypeScript, vitest. Gerenciador JS: **Bun**.

**Spec:** `docs/superpowers/specs/2026-10-31-captura-por-voz-e-entrada-externa-design.md` (§4.1 e §5 valem; §4.2 a §4.5 e a §9 ficam **adiadas** até o gate de 30 dias). Plano completo adiado: `docs/superpowers/plans/2026-10-31-captura-por-voz-e-entrada-externa.md`. Validações: engenheiro sênior = GO COM MUDANÇAS; CEO = INVESTIR REDUZIDO; o Sthevan aprovou o caminho enxuto em 31/10.

## Global Constraints

- Captura **desligada por padrão**; desligada, o atalho **não é registrado**, nenhum comando de captura faz efeito e o app se comporta como hoje. Os 240 `#[test]` atuais de `src-tauri` seguem passando em toda tarefa.
- **Não** adicionar `TaskSource::External` nem alterar o formato de `tasks.json` (uma versão antiga do app não pode ler lista vazia e apagar as tarefas).
- Limites que já existem: título **200** caracteres, nota **20.000**, minutos **5..=180**.
- Logs **nunca** contêm texto de tarefas ou notas; só ids, contagens e erros.
- Atalho de captura padrão: `CommandOrControl+Alt+KeyJ` (escolha do plano).
- Comandos: Rust `cargo test --manifest-path src-tauri/Cargo.toml <filtro>`; front `bunx vitest run <arquivo>` e `bunx tsc --noEmit`. Não usar npm/pnpm.
- Um branch por fase a partir de `dev` (`feat/escrita-atomica-e-logs`, depois `feat/captura-por-voz`). Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Nenhum `git push`.
- Código em inglês e genérico (nada de "wispr" no código); textos da interface em português.

## Review Focus

1. **Ditado do Wispr vem pontuado e com maiúscula** ("Tarefa: revisar o PR.", "Tarefa, revisar…"): a palavra-chave é reconhecida e o ponto final some do título (Task 4).
2. **Captura desligada**: o atalho não está registrado e `capture_commit` devolve erro sem gravar nada (Task 6).
3. **Atalho já usado por outro programa ao ligar**: a captura continua desligada, a configuração não muda, o motivo aparece na tela (Task 6).
4. **Arquivo de tarefas/atividade/configurações corrompido**: vai para quarentena e nunca é regravado vazio por cima (Task 3).
5. **Texto vazio, só espaços ou de 20.001 caracteres** na captura: nada é gravado e nada trava (Tasks 4 e 6).

## Estrutura de arquivos

Criar (`src-tauri/src/`): `fsutil.rs` · `logging.rs` · `capture/mod.rs` · `capture/parse.rs` · `capture/commands.rs` · `capture_window.rs`.
Criar (`src/`): `CaptureWindow.tsx` · `lib/capture.ts` · `lib/capture.test.ts` · `settings/CaptureSection.tsx`.
Modificar: `config.rs`, `shortcuts.rs`, `lib.rs`, `state.rs`, `tracker/tasks.rs`, `tracker/activity.rs`, `Cargo.toml`, `capabilities/default.json`, `src/main.tsx`, `src/App.tsx`, `src/lib/tauri.ts`, `src/lib/types.ts`.

---

# Fase 0 — Robustez e logs (branch `feat/escrita-atomica-e-logs`)

### Task 1: Gravação atômica e quarentena

**Files:** Create `src-tauri/src/fsutil.rs`; Modify `src-tauri/src/lib.rs` (só `mod fsutil;`).

**Interfaces — Produces:**
`pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()>` (cria a pasta, grava `<nome>.tmp`, `rename`) ·
`pub fn quarantine(path: &Path, stamp_ms: i64) -> io::Result<PathBuf>` (move para `<stem>.corrupt-<stamp>.json`, nunca sobrescreve: se existir, acrescenta `-1`, `-2`…).

- [ ] **Step 1: testes** em `fsutil.rs` (pasta `std::env::temp_dir().join(uuid)`): `write_atomic_replaces_whole_file` (grava "a", depois "bb" → lê "bb", nenhum `.tmp` sobra) · `write_atomic_creates_missing_parent` · `quarantine_moves_and_never_overwrites` (duas chamadas com o mesmo stamp → dois arquivos distintos, original ausente).
- [ ] **Step 2:** `cargo test --manifest-path src-tauri/Cargo.toml fsutil` → FALHA (módulo ausente).
- [ ] **Step 3:** implementar as duas funções.
- [ ] **Step 4:** mesmo comando → PASSA.
- [ ] **Step 5:** commit `feat: gravação atômica e quarentena de arquivos`.

### Task 2: Logs no backend

**Files:** Create `src-tauri/src/logging.rs`; Modify `Cargo.toml` (`tracing = "0.1"`, `tracing-subscriber = "0.3"`, `tracing-appender = "0.2"`), `lib.rs` (chamar `logging::init()` no início de `run` e guardar o guard), `config.rs` (só acrescentar `local_data_dir`).

**Interfaces — Produces:**
`pub fn init_in(dir: &Path) -> Result<WorkerGuard, String>` (arquivo diário, 7 arquivos, nível por `FOCUSBREW_LOG`, padrão `info`) ·
`pub fn init() -> Option<WorkerGuard>` (usa `config::local_data_dir().join("logs")`; falha vira `None`, nunca derruba o app) ·
`pub fn log_io(what: &str, result: io::Result<()>)` (erro → `tracing::error!` só com `what` e a mensagem do erro) ·
`config::local_data_dir() -> PathBuf` (`ProjectDirs::data_local_dir()`, cria a pasta).

- [ ] **Step 1: testes:** `init_in_writes_a_line_to_a_file` (emite `tracing::info!("hello")`, solta o guard, a pasta tem um arquivo contendo "hello") · `log_io_ok_is_silent_and_err_does_not_panic`.
- [ ] **Step 2:** `cargo test ... logging` → FALHA.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `cargo test ... logging` e `... config` → PASSAM.
- [ ] **Step 5:** commit `feat: logs em arquivo no backend`.

### Task 3: Gravação atômica e carga segura de tarefas, atividade e configurações

**Files:** Modify `tracker/tasks.rs`, `tracker/activity.rs`, `config.rs`, `state.rs` (`save_tracker`), `commands.rs`/`lib.rs` (os `let _ = ...save(...)` viram `logging::log_io`).

**Interfaces — Consumes:** Task 1 (`write_atomic`, `quarantine`), Task 2 (`log_io`). **Produces:**
`tasks::load_from(path: &Path, stamp_ms: i64) -> Vec<Task>` · `activity::load_from(path: &Path, stamp_ms: i64)` (tipo real do log de atividade) · `config::load_from(path: &Path, stamp_ms: i64) -> AppConfig`. Regra comum: arquivo ausente ou só espaços → vazio/padrão; ilegível → quarentena + `tracing::error!` + vazio/padrão, e **nunca** regrava por cima de um arquivo que não conseguiu ler. `load()` de cada um passa a chamar `load_from`; `parse` atual continua para os testes de arquivo antigo.

- [ ] **Step 1: testes** (um por arquivo; os existentes seguem intactos): `corrupt_tasks_file_is_quarantined_not_erased` (arquivo `{"x"`; após `load_from` o original some, existe `tasks.corrupt-<stamp>.json` com o mesmo conteúdo, retorno vazio) · `missing_file_is_empty_without_quarantine` · `save_leaves_no_tmp_and_is_valid_json` · idem para activity e config.
- [ ] **Step 2:** `cargo test ... tasks` / `... activity` / `... config` → FALHA.
- [ ] **Step 3:** trocar `fs::write` por `fsutil::write_atomic` nas três `save`; criar os `load_from`; trocar os `let _ =` de gravação por `log_io`.
- [ ] **Step 4:** `cargo test --manifest-path src-tauri/Cargo.toml` (suíte inteira) → PASSA, 240+ testes.
- [ ] **Step 5:** commit `fix: gravação atômica e carga segura de tarefas, atividade e configurações`.

---

# Fase 1 enxuta — Caixa de captura (branch `feat/captura-por-voz`, a partir da F0)

### Task 4: Interpretador `parse_capture`

**Files:** Create `src-tauri/src/capture/mod.rs` (`pub mod parse;`), `capture/parse.rs`; Modify `lib.rs` (só `mod capture;`).

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
Regras: primeira palavra, sem acento/caixa e sem pontuação colada, em `tarefa|task|atividade` / `nota|note` / `tempo|time`; separador opcional (`:` `,` `-`). Em tarefa: extrair no fim `tempo N` (também `N min`, `N minutos`, `N hora(s)` = 60·N), depois `hoje`/`amanhã`/`amanha`/`AAAA-MM-DD` → `day` (relativo a `today`), depois `tasks::split_project`; título limpo por `tasks::clean_title`; ponto e vírgula finais removidos. `tempo N` sozinho → `SetMinutes` (o clamp é do chamador). Texto vazio, só palavra-chave ou título vazio → `Unknown`. Nota acima de 20.000 caracteres → `Unknown`.

- [ ] **Step 1: testes por tabela:** `"tarefa revisar PR #focusbrew, tempo 40"` → Task{title:"revisar PR", project:Some("focusbrew"), minutes:Some(40), day:None} · `"Tarefa: revisar o PR."` e `"Tarefa, revisar o PR"` → title `"revisar o PR"` · `"task fix login amanhã"` com today `"2026-10-31"` → day `Some("2026-11-01")` · `"nota ligar pro cliente na segunda"` → Note{text:"ligar pro cliente na segunda"} · `"tempo 40"`, `"Tempo 1 hora"` → SetMinutes 40 / 60 · `"tempo 4"` → SetMinutes 4 · `""`, `"   "`, `"tarefa"`, `"bom dia"` → Unknown · nota de 20.001 caracteres → Unknown.
- [ ] **Step 2:** `cargo test ... capture::parse` → FALHA.
- [ ] **Step 3:** implementar, função pura, sem IA e sem regex pesada.
- [ ] **Step 4:** PASSA.
- [ ] **Step 5:** commit `feat: interpretador de captura por voz`.

### Task 5: Configurações e quarto atalho global

**Files:** Modify `config.rs`, `shortcuts.rs`, `lib.rs` (registro no `setup`), `src/lib/types.ts`.

**Interfaces — Produces:** campos em `AppConfig` (e no `Default`): `capture_enabled: bool = false`, `shortcut_capture: String = "CommandOrControl+Alt+KeyJ"`. `shortcuts::Action::Capture` (slot 3; `Slots` passa a `[Option<Shortcut>; 4]`) · `pub fn clear(app: &AppHandle, action: Action)` (desregistra e limpa o slot) · `check_conflict` contra os outros três. `update_settings` preserva `capture_enabled` e `shortcut_capture` do estado. No `setup`, o atalho de captura só é registrado se `capture_enabled`. Espelhar os campos em `types.ts`.

- [ ] **Step 1: testes:** `capture_fields_default_off` · `an_old_settings_file_loads_with_capture_defaults` · `find_action_knows_the_capture_slot` · `the_four_actions_use_four_distinct_slots` · `capture_shortcut_cannot_equal_another` (reescrever os testes de 3 slots que dependem do tamanho).
- [ ] **Step 2:** `cargo test ... config` e `... shortcuts` → FALHA.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASSA + suíte inteira.
- [ ] **Step 5:** commit `feat: configuração e atalho da caixa de captura`.

### Task 6: Janela de captura e comandos

**Files:** Create `capture_window.rs`, `capture/commands.rs`; Modify `capture/mod.rs`, `lib.rs` (módulos, `invoke_handler`, tratador do atalho `Action::Capture`), `capabilities/default.json` (`"capture"` em `windows`).

**Interfaces — Consumes:** Tasks 4 e 5. **Produces:**
`capture_window::open(app: &AppHandle)` (janela `capture`, ~560×200, centrada no monitor do cursor, copiando o padrão de `note_window.rs`; aberta fora da thread do evento do atalho, como o `note_action`) ·
`pub fn resolve_minutes_target(open_today: &[(String, i64)], timer_task: Option<&str>) -> Target` com `Target::One(id) | Target::Pick(Vec<String>) | Target::None` — timer ativo → esse; senão uma só tarefa aberta hoje → ela; senão até 5 mais recentes (a mais nova primeiro) para escolher ·
comandos `#[tauri::command]`: `capture_preview(text: String) -> CapturePreview` (serializa `Parsed` + alvo de tempo resolvido; sem efeito colateral), `capture_commit(item: CaptureItem) -> Result<StateSnapshot, String>`, `open_capture()`, `set_capture_enabled(enabled: bool) -> Result<StateSnapshot, String>` (liga: registra o atalho; falha → continua desligada, não altera a configuração e devolve o motivo; desliga: `shortcuts::clear`).
`CaptureItem` = `Task{title, project, minutes, day} | Note{text} | SetMinutes{task_id, minutes}`.

- [ ] **Step 1: testes:** `target_prefers_running_timer` · `target_single_open_task` · `target_many_open_tasks_returns_five_newest_first` · `target_none_without_tasks` · `commit_task_uses_default_minutes_when_not_spoken` · `commit_task_clamps_minutes_to_5_180` · `commit_note_adds_origin_line` (texto + `"\n\n— ditado, 31/10 12:40"`) · `commit_is_refused_when_capture_disabled` · `commit_blank_or_oversized_text_writes_nothing`.
- [ ] **Step 2:** `cargo test ... capture` → FALHA.
- [ ] **Step 3:** implementar; `capture_commit` usa `apply()` (tarefa e tempo) e `NotesStore::upsert` + `notes::save` + evento `notes-changed` (nota); a lógica de montar o item fica em funções puras testáveis fora do `AppHandle`.
- [ ] **Step 4:** PASSA + suíte inteira.
- [ ] **Step 5:** commit `feat: janela e comandos da caixa de captura`.

### Task 7: Interface da caixa de captura e da seção Captura por voz

**Files:** Create `src/CaptureWindow.tsx`, `src/lib/capture.ts`, `src/lib/capture.test.ts`, `src/settings/CaptureSection.tsx`; Modify `src/main.tsx` (rótulo `capture` → `<CaptureWindow/>`), `src/App.tsx` (seção "Captura por voz"), `src/lib/tauri.ts` (`capturePreview`, `captureCommit`, `openCapture`, `setCaptureEnabled`).

**Interfaces — Produces (`capture.ts`):** `type CapturePreview` espelhando o Rust · `describePreview(p: CapturePreview): string` ("Tarefa · 40 min · #focusbrew · hoje") · `canCommit(p: CapturePreview, pick?: string): boolean` (falso para `unknown` e para `Pick` sem escolha).

- [ ] **Step 1: testes (`capture.test.ts`):** `describePreview` para tarefa completa, nota e ajuste de tempo; `canCommit` falso para `unknown` e para `Pick` sem escolha, verdadeiro com escolha.
- [ ] **Step 2:** `bunx vitest run src/lib/capture.test.ts` → FALHA.
- [ ] **Step 3:** implementar `capture.ts`; a janela: campo de texto com foco automático, pré-visualização viva (debounce 150 ms), Enter confirma, Esc fecha, `unknown` mostra o texto e os botões "Tarefa" e "Nota", `Pick` mostra a lista. `CaptureSection`: interruptor (erro do backend visível), campo do atalho (mesmo padrão de `GeneralSection`).
- [ ] **Step 4:** `bunx vitest run` e `bunx tsc --noEmit` → PASSAM.
- [ ] **Step 5:** commit `feat: tela da caixa de captura e seção Captura por voz`.

### Task 8: Teste manual feito por agente (somente verificação)

**Files:** nenhum arquivo de produto; relatório em `.superpowers/sdd/…/task-8-report.md`.

- [ ] **Step 1:** compilar e rodar o app em modo de desenvolvimento (`bun run tauri dev`) com os dados em uma pasta de teste, **sem tocar nas tarefas e notas reais do Sthevan** (usar um perfil de dados separado ou fazer backup e restaurar `tasks.json`/`notes.json`/`settings.json`).
- [ ] **Step 2:** ligar a captura, apertar o atalho e verificar que a janela abre e recebe foco. Enviar o texto de três jeitos que imitam o Wispr: teclas simuladas (SendInput), colar pelo `Ctrl+V` e colar com pontuação/maiúscula ("Tarefa: revisar o PR.").
- [ ] **Step 3:** conferir em `tasks.json`/`notes.json` o resultado de: uma tarefa com `#projeto` e `tempo 40`, uma nota, um `tempo 25` com timer ativo, texto vazio (nada grava), captura desligada (atalho sem efeito).
- [ ] **Step 4:** registrar o que passou, o que falhou e as evidências; **o teste com o Wispr real (microfone) é do Sthevan**, não do agente.

## Autoavaliação

**Cobertura:** F0 → spec §5 (T1 a T3) · captura → spec §4.1 (T4 a T7, sem preenchimento pela área de transferência, decisão do gate) · critérios S1 (T6, T8) e S3 (regra global e T6). Fora desta versão, por decisão do Sthevan em 31/10: sugestões, porta, token, pasta de entrega, reuniões, skill e `external_ref`.
**Tipos:** `Parsed` (T4) é o que `CapturePreview` serializa e `CaptureItem` consome (T6); `Action::Capture` (T5) é o atalho registrado por `set_capture_enabled` (T6).
