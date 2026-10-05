# focusbrew v0.2 — daily tracker no notch (etapa 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o "modo foco" do focusbrew por um tracker do dia: tarefas com timer próprio, widget colado no topo da tela com linha de progresso, painel To Do + Activity que abre com o mouse e janela de configurações.

**Architecture:** O backend Rust guarda o timer por *horário final* (`deadline_ms`) num módulo puro (`tracker/`, sem Tauri nem disco, relógio injetado) e o React só desenha a partir desse horário. A janela `widget` continua uma só, redimensionada pelo backend conforme o estado (parado, rodando, aberto) e a escala; a janela `main` vira as configurações. Todo o foco antigo (detecção, bloqueio, Não Perturbe, pausa-café) é removido num único corte (Task 7).

**Tech Stack:** Tauri 2, Rust (serde, chrono, uuid, tokio), React 19 + TypeScript + Vite, `vitest` (novo, só pra contas puras), npm.

**Spec:** `docs/superpowers/specs/2026-10-05-daily-notch-design.md` (aprovada em 2026-10-05)

## Global Constraints

- Tauri 2 + React/TypeScript + Rust, como hoje. Gerenciador de pacotes: **npm** (o projeto tem `package-lock.json`; não migrar pro Bun sem perguntar).
- Todo texto de interface em **português do Brasil**, exceto os rótulos que a spec mantém iguais aos do DailyNotch: `To Do`, `Add a task`, `Activity`, `Progress timeline`, `RGB timeline`, `Standard`, `Minimal`.
- `settings.json`, `tasks.json` e `activity.json` antigos continuam carregando sem apagar o que ainda faz sentido; arquivo vazio, corrompido ou parcial vira valores padrão, nunca pânico.
- Nada de rede nova. O GitHub segue como está (login pelo `gh`, atualização a cada 5 min).
- Medidas no tamanho **Médio** (escala 1,0); Pequeno = 0,85, Grande = 1,25; a escala vale pra largura, altura, fontes e espessura da linha.
- Widget: janela com `y` = topo do monitor principal (sem margem), sem borda e sem arredondamento em cima (só os cantos de baixo, raio 14 px), a linha de progresso nunca passa pelo topo. Tamanhos (Médio): parado 140×14 (barra de 6 px), rodando 320×44, aberto 470×230. Abre com o mouse depois de **250 ms**, fecha **400 ms** depois de sair.
- Cores: fundo do widget `#000000`, painel `#0B0B0D`, linhas e cartões `#1A1A1D`, texto `#F2F2F3`, texto apagado `#8A8A90`, destaque padrão `#0A84FF`.
- Minutos de uma tarefa: 5..=180, de 5 em 5, padrão 25. Título: aparado, não vazio, no máximo 200 caracteres.
- Sono do computador: se passarem mais de **90 s** entre duas conferências de 1 s, o intervalo não conta.
- Plataforma: **Windows**. O código não precisa compilar com funcionalidade em Linux/macOS além do que já compila.
- Cada tarefa termina com `cargo test` verde (e `npx tsc --noEmit` verde quando mexe no front-end) e um commit.

## Decisões do plano que ajustam a spec

Cinco pontos que a spec não cobria, ou que o plano organiza diferente. A Task 0 registra os cinco na própria spec:

1. **Pasta `tracker/`.** Os módulos puros (`timer`, `tasks`, `activity` e o `Tracker` que os junta) ficam em `src-tauri/src/tracker/` em vez de soltos na raiz. Mesmas responsabilidades da tabela da seção 12; a pasta evita colidir com os arquivos antigos até o corte da Task 6.
2. **Remover tarefa.** A spec tinha o comando `remove_task`, mas nenhum controle na tela. A linha da tarefa ganha um **×** discreto que só aparece ao passar o mouse nela.
3. **Dica da bandeja.** Sem `mm:ss` (a contagem já está no widget): `focusbrew`, `focusbrew — <tarefa>` ou `focusbrew — <tarefa> (pausado)`. O item "Pausar/retomar" do menu fica sempre visível e não faz nada com o timer parado.
4. **Relógio da interface.** A contagem e a linha de progresso atualizam **a cada 250 ms**, não a cada quadro (`requestAnimationFrame`): a linha anda bem menos de 1 px por segundo e a contagem muda 1 vez por segundo, então 4 atualizações por segundo ficam suaves e quase não gastam CPU (o app já teve problema de lentidão).
5. **Altura do painel.** Em 230 px a lista de tarefas mostra cerca de 3 a 4 linhas (menos com notas) e rola por dentro quando passa disso; a spec dizia "cabem 4 linhas".

## Review Focus

Os cinco casos que a spec implica mas que as tarefas "felizes" não exercitariam; cada um tem o teste dentro da tarefa dona do código:

1. **Arquivos corrompidos ou vazios** (`tasks.json` vazio ou com lixo, `activity.json` com outro formato, `settings.json` truncado) → valores padrão, sem pânico. Testes na Task 2, Task 3 e Task 5.
2. **Relógio que anda pra trás** (ajuste de hora do Windows) → o restante nunca passa do planejado e o decorrido nunca fica negativo. Teste na Task 1.
3. **Bloco que cruza a meia-noite** → o tempo vai pro dia em que o bloco **termina**. Teste na Task 4.
4. **Monitor com origem negativa ou DPI diferente de 100 %** → o widget fica centralizado e no topo desse monitor. Testes na Task 6 (`top_center_x` e `logical_monitor`).
5. **Título só com espaços, muito longo ou com acento/emoji** → espaços são recusados, o resto é cortado em 200 *caracteres* (não bytes) sem quebrar. Teste na Task 2; confirmado na tela na Task 12.

---

### Task 0: Registrar na spec as cinco decisões do plano

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-daily-notch-design.md`

- [ ] **Step 1: Seção 5 — controle de remover**

Em `## 5. O painel`, na lista da coluna esquerda, depois do item da **alça** de seis pontos, acrescentar:

```markdown
- **×** pequeno, que só aparece ao passar o mouse na linha, antes da alça; remove
  a tarefa (inclusive concluída). Se ela está rodando, o tempo trabalhado é
  guardado antes de remover.
```

- [ ] **Step 2: Seção 9 — dica e menu**

Em `## 9. Bandeja`, trocar a frase da dica por:

```markdown
Dica: `focusbrew` parado, `focusbrew — <tarefa>` com timer rodando ou
`focusbrew — <tarefa> (pausado)`. O item **Pausar/retomar** fica sempre no menu
e não faz nada com o timer parado.
```

- [ ] **Step 3: Seção 12 — pasta `tracker/`**

Em `## 12. Arquitetura (arquivos)`, trocar as três primeiras linhas da tabela (`timer.rs`, `tasks.rs`, `activity.rs`) por:

```markdown
| `src-tauri/src/tracker/timer.rs` | O enum `Timer`, as transições e as contas de tempo. Puro, sem Tauri. |
| `src-tauri/src/tracker/tasks.rs` | `Task`, leitura/gravação, `reorder`, limites. |
| `src-tauri/src/tracker/activity.rs` | `focus_secs_by_day` e `add_focus_secs`. |
| `src-tauri/src/tracker/mod.rs` | `Tracker`: junta timer, tarefas e atividade (iniciar, pausar, parar, tick). Puro. |
```

- [ ] **Step 4: Seção 4 — o relógio da interface**

Em `## 4. O widget`, no parágrafo da **Linha de progresso**, trocar o trecho `desenhada com `requestAnimationFrame`; a interface não conta tempo sozinha.` por:

```markdown
atualizada a cada 250 ms (a linha anda bem menos de 1 px por segundo; atualizar
a cada quadro só gastaria CPU); a interface não conta tempo sozinha.
```

- [ ] **Step 5: Seção 5 — altura da lista**

Em `## 5. O painel`, trocar `Cabem 4 linhas; passando disso a lista rola por dentro.` por:

```markdown
A lista mostra de 3 a 4 linhas (menos quando há notas) e rola por dentro quando
passa disso.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-10-05-daily-notch-design.md
git commit -m "docs: align the daily-notch spec with the implementation plan" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Motor do timer (`tracker/timer.rs`)

**Files:**
- Create: `src-tauri/src/tracker/mod.rs` (só a declaração dos submódulos por enquanto)
- Create: `src-tauri/src/tracker/timer.rs`
- Modify: `src-tauri/src/lib.rs:1-11` (declarar `mod tracker;`)

**Interfaces:**
- Consumes: nada.
- Produces (`crate::tracker::timer`):
  - `pub const SLEEP_GAP_MS: i64 = 90_000;`
  - `pub enum Timer { Idle, Running { task_id: String, planned_secs: u32, deadline_ms: i64 }, Paused { task_id: String, planned_secs: u32, remaining_secs: u32 } }` (`Debug, Clone, PartialEq, Eq`)
  - `pub enum TimerStatus { Idle, Running, Paused }` (`Copy`, `Serialize` em minúsculas)
  - `pub struct TimerView { status: TimerStatus, task_id: Option<String>, planned_secs: u32, remaining_secs: u32, deadline_ms: i64 }` (`Serialize`)
  - `Timer::start(task_id: &str, planned_secs: u32, now_ms: i64) -> Timer`
  - `Timer::status(&self) -> TimerStatus`, `task_id(&self) -> Option<&str>`, `planned_secs(&self) -> u32`
  - `Timer::remaining_secs(&self, now_ms: i64) -> u32`, `elapsed_secs(&self, now_ms: i64) -> u32`
  - `Timer::pause(&mut self, now_ms: i64)`, `resume(&mut self, now_ms: i64)`
  - `Timer::set_planned(&mut self, new_planned_secs: u32, now_ms: i64) -> bool` (`true` = o novo tamanho já foi usado, o bloco deve terminar agora)
  - `Timer::is_expired(&self, now_ms: i64) -> bool`, `shift_deadline(&mut self, by_ms: i64)`
  - `Timer::view(&self, now_ms: i64) -> TimerView`

- [ ] **Step 1: Criar `tracker/mod.rs` e declarar o módulo**

`src-tauri/src/tracker/mod.rs`:

```rust
//! Everything about the tasks of the day and the timer that runs on them.
//! Pure logic: no Tauri, no clock of its own, so it is unit-testable.

pub mod timer;
```

Em `src-tauri/src/lib.rs`, na lista de `mod` (linhas 1–11), acrescentar `mod tracker;` em ordem alfabética (depois de `mod timer;`).

- [ ] **Step 2: Escrever os testes que falham**

Criar `src-tauri/src/tracker/timer.rs` só com o bloco de testes (a implementação vem no Step 4; sem ela o arquivo não compila, que é o "falha" esperado):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const T0: i64 = 1_000_000;
    const MIN: i64 = 60_000;

    #[test]
    fn start_sets_the_deadline() {
        let t = Timer::start("a", 25 * 60, T0);
        assert_eq!(
            t,
            Timer::Running { task_id: "a".into(), planned_secs: 1500, deadline_ms: T0 + 1_500_000 }
        );
    }

    #[test]
    fn remaining_rounds_up_so_a_fresh_block_shows_the_full_length() {
        let t = Timer::start("a", 300, T0);
        assert_eq!(t.remaining_secs(T0), 300);
        assert_eq!(t.remaining_secs(T0 + 1), 300);
        assert_eq!(t.remaining_secs(T0 + 1001), 299);
    }

    #[test]
    fn elapsed_counts_whole_seconds() {
        let t = Timer::start("a", 25 * 60, T0);
        assert_eq!(t.elapsed_secs(T0 + 90_000), 90);
        assert_eq!(t.elapsed_secs(T0), 0);
    }

    // Review focus: the Windows clock can be set back (NTP, manual change).
    #[test]
    fn a_clock_that_goes_backwards_never_reports_more_than_planned() {
        let t = Timer::start("a", 300, T0);
        assert_eq!(t.remaining_secs(T0 - 10 * MIN), 300);
        assert_eq!(t.elapsed_secs(T0 - 10 * MIN), 0);
    }

    #[test]
    fn pause_freezes_and_resume_recomputes_the_deadline() {
        let mut t = Timer::start("a", 300, T0);
        t.pause(T0 + 100_000);
        assert_eq!(
            t,
            Timer::Paused { task_id: "a".into(), planned_secs: 300, remaining_secs: 200 }
        );
        // an hour passes while paused: nothing changes
        assert_eq!(t.remaining_secs(T0 + 60 * MIN), 200);
        t.resume(T0 + 60 * MIN);
        assert_eq!(
            t,
            Timer::Running { task_id: "a".into(), planned_secs: 300, deadline_ms: T0 + 60 * MIN + 200_000 }
        );
    }

    #[test]
    fn pause_and_resume_do_nothing_in_the_wrong_state() {
        let mut idle = Timer::Idle;
        idle.pause(T0);
        idle.resume(T0);
        assert_eq!(idle, Timer::Idle);

        let mut running = Timer::start("a", 300, T0);
        let before = running.clone();
        running.resume(T0 + 1000);
        assert_eq!(running, before);
    }

    #[test]
    fn set_planned_rebases_a_running_block() {
        let mut t = Timer::start("a", 25 * 60, T0);
        let now = T0 + 10 * MIN;
        assert!(!t.set_planned(45 * 60, now));
        assert_eq!(
            t,
            Timer::Running { task_id: "a".into(), planned_secs: 45 * 60, deadline_ms: now + 35 * MIN }
        );
        assert_eq!(t.elapsed_secs(now), 600);
    }

    #[test]
    fn set_planned_shorter_than_the_time_worked_ends_the_block() {
        let mut t = Timer::start("a", 25 * 60, T0);
        assert!(t.set_planned(5 * 60, T0 + 10 * MIN));
    }

    #[test]
    fn set_planned_works_while_paused() {
        let mut t = Timer::start("a", 25 * 60, T0);
        t.pause(T0 + 10 * MIN);
        assert!(!t.set_planned(30 * 60, T0 + 20 * MIN));
        assert_eq!(
            t,
            Timer::Paused { task_id: "a".into(), planned_secs: 30 * 60, remaining_secs: 20 * 60 }
        );
    }

    #[test]
    fn set_planned_on_idle_is_a_no_op() {
        let mut t = Timer::Idle;
        assert!(!t.set_planned(600, T0));
        assert_eq!(t, Timer::Idle);
    }

    #[test]
    fn expiry_includes_the_deadline_itself() {
        let t = Timer::start("a", 60, T0);
        assert!(!t.is_expired(T0 + 59_999));
        assert!(t.is_expired(T0 + 60_000));
    }

    #[test]
    fn a_paused_or_idle_timer_never_expires() {
        let mut t = Timer::start("a", 60, T0);
        t.pause(T0 + 1000);
        assert!(!t.is_expired(T0 + 100 * MIN));
        assert!(!Timer::Idle.is_expired(T0 + 100 * MIN));
    }

    #[test]
    fn shift_deadline_only_moves_a_running_timer() {
        let mut running = Timer::start("a", 60, T0);
        running.shift_deadline(5_000);
        assert_eq!(
            running,
            Timer::Running { task_id: "a".into(), planned_secs: 60, deadline_ms: T0 + 65_000 }
        );

        let mut paused = Timer::start("a", 60, T0);
        paused.pause(T0 + 10_000);
        let before = paused.clone();
        paused.shift_deadline(5_000);
        assert_eq!(paused, before);

        let mut idle = Timer::Idle;
        idle.shift_deadline(5_000);
        assert_eq!(idle, Timer::Idle);
    }

    #[test]
    fn the_view_reports_each_state() {
        let idle = Timer::Idle.view(T0);
        assert_eq!(idle.status, TimerStatus::Idle);
        assert_eq!(idle.task_id, None);
        assert_eq!((idle.planned_secs, idle.remaining_secs, idle.deadline_ms), (0, 0, 0));

        let running = Timer::start("a", 300, T0).view(T0 + 1001);
        assert_eq!(running.status, TimerStatus::Running);
        assert_eq!(running.task_id.as_deref(), Some("a"));
        assert_eq!((running.planned_secs, running.remaining_secs), (300, 299));
        assert_eq!(running.deadline_ms, T0 + 300_000);

        let mut p = Timer::start("a", 300, T0);
        p.pause(T0 + 100_000);
        let paused = p.view(T0 + 999_999);
        assert_eq!(paused.status, TimerStatus::Paused);
        assert_eq!((paused.remaining_secs, paused.deadline_ms), (200, 0));
    }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run (em `src-tauri`): `cargo test tracker::timer 2>&1 | grep -E "^error" | sort | uniq -c`
Expected: `cannot find type`/`cannot find value` para `Timer`, `TimerStatus` (não compila).

- [ ] **Step 4: Implementar (acima do bloco de testes, no mesmo arquivo)**

```rust
//! The countdown for the task that is running.
//!
//! Pure on purpose: no Tauri, no disk, and the clock is always passed in
//! (`now_ms`, milliseconds since the Unix epoch), so every rule below is a
//! plain unit test.

use serde::Serialize;

/// If more than this passes between two 1 s checks, the computer was asleep.
pub const SLEEP_GAP_MS: i64 = 90_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Timer {
    Idle,
    Running { task_id: String, planned_secs: u32, deadline_ms: i64 },
    Paused { task_id: String, planned_secs: u32, remaining_secs: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerStatus {
    Idle,
    Running,
    Paused,
}

/// What the front-end gets: it draws the countdown and the progress line
/// from `deadline_ms` / `remaining_secs`, it never counts time itself.
#[derive(Debug, Clone, Serialize)]
pub struct TimerView {
    pub status: TimerStatus,
    pub task_id: Option<String>,
    pub planned_secs: u32,
    pub remaining_secs: u32,
    pub deadline_ms: i64,
}

impl Timer {
    pub fn start(task_id: &str, planned_secs: u32, now_ms: i64) -> Self {
        Timer::Running {
            task_id: task_id.to_string(),
            planned_secs,
            deadline_ms: now_ms + planned_secs as i64 * 1000,
        }
    }

    pub fn status(&self) -> TimerStatus {
        match self {
            Timer::Idle => TimerStatus::Idle,
            Timer::Running { .. } => TimerStatus::Running,
            Timer::Paused { .. } => TimerStatus::Paused,
        }
    }

    pub fn task_id(&self) -> Option<&str> {
        match self {
            Timer::Idle => None,
            Timer::Running { task_id, .. } | Timer::Paused { task_id, .. } => Some(task_id),
        }
    }

    pub fn planned_secs(&self) -> u32 {
        match self {
            Timer::Idle => 0,
            Timer::Running { planned_secs, .. } | Timer::Paused { planned_secs, .. } => *planned_secs,
        }
    }

    /// Seconds left, rounded **up** so a fresh block shows its full length,
    /// and never more than planned (the system clock may go backwards).
    pub fn remaining_secs(&self, now_ms: i64) -> u32 {
        match self {
            Timer::Idle => 0,
            Timer::Paused { remaining_secs, .. } => *remaining_secs,
            Timer::Running { planned_secs, deadline_ms, .. } => {
                let left_ms = (deadline_ms - now_ms).max(0);
                let secs = ((left_ms + 999) / 1000) as u64;
                secs.min(*planned_secs as u64) as u32
            }
        }
    }

    /// Whole seconds worked in this block so far.
    pub fn elapsed_secs(&self, now_ms: i64) -> u32 {
        self.planned_secs().saturating_sub(self.remaining_secs(now_ms))
    }

    pub fn pause(&mut self, now_ms: i64) {
        if let Timer::Running { task_id, planned_secs, .. } = self.clone() {
            let remaining_secs = self.remaining_secs(now_ms);
            *self = Timer::Paused { task_id, planned_secs, remaining_secs };
        }
    }

    pub fn resume(&mut self, now_ms: i64) {
        if let Timer::Paused { task_id, planned_secs, remaining_secs } = self.clone() {
            *self = Timer::Running {
                task_id,
                planned_secs,
                deadline_ms: now_ms + remaining_secs as i64 * 1000,
            };
        }
    }

    /// Changes the planned length keeping the time already worked. Returns
    /// `true` when the new length is already used up — the block must end now
    /// (the timer is left untouched in that case).
    pub fn set_planned(&mut self, new_planned_secs: u32, now_ms: i64) -> bool {
        let remaining = new_planned_secs.saturating_sub(self.elapsed_secs(now_ms));
        if remaining == 0 {
            return !matches!(self, Timer::Idle);
        }
        match self {
            Timer::Idle => false,
            Timer::Running { planned_secs, deadline_ms, .. } => {
                *planned_secs = new_planned_secs;
                *deadline_ms = now_ms + remaining as i64 * 1000;
                false
            }
            Timer::Paused { planned_secs, remaining_secs, .. } => {
                *planned_secs = new_planned_secs;
                *remaining_secs = remaining;
                false
            }
        }
    }

    pub fn is_expired(&self, now_ms: i64) -> bool {
        matches!(self, Timer::Running { deadline_ms, .. } if now_ms >= *deadline_ms)
    }

    /// Pushes a running deadline later (the computer slept; that time is not work).
    pub fn shift_deadline(&mut self, by_ms: i64) {
        if let Timer::Running { deadline_ms, .. } = self {
            *deadline_ms += by_ms;
        }
    }

    pub fn view(&self, now_ms: i64) -> TimerView {
        TimerView {
            status: self.status(),
            task_id: self.task_id().map(str::to_string),
            planned_secs: self.planned_secs(),
            remaining_secs: self.remaining_secs(now_ms),
            deadline_ms: match self {
                Timer::Running { deadline_ms, .. } => *deadline_ms,
                _ => 0,
            },
        }
    }
}
```

No topo de `tracker/mod.rs`, o módulo ainda não é usado fora dos testes; permitir código não usado até a Task 6:

```rust
#![allow(dead_code)] // wired up in Task 7; remove there
```

(Colocar essa linha **antes** do `pub mod timer;`.)

- [ ] **Step 5: Rodar e ver passar**

Run: `cargo test tracker::timer`
Expected: `test result: ok. 14 passed`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/tracker src-tauri/src/lib.rs
git commit -m "feat: pure timer engine driven by a deadline" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tarefas (`tracker/tasks.rs`)

**Files:**
- Create: `src-tauri/src/tracker/tasks.rs`
- Modify: `src-tauri/src/tracker/mod.rs` (declarar `pub mod tasks;`)

**Interfaces:**
- Consumes: `crate::config::data_dir() -> PathBuf` (já existe).
- Produces (`crate::tracker::tasks`):
  - `pub const MIN_MINUTES: u32 = 5; MAX_MINUTES: u32 = 180; DEFAULT_MINUTES: u32 = 25; MAX_TITLE_CHARS: usize = 200;`
  - `pub enum TaskSource { Manual, Github }` (`Copy`, serde minúsculo)
  - `pub struct Task { id: String, title: String, note: Option<String>, minutes: u32, done: bool, created_at: String, source: TaskSource, spent_secs: u32 }` (`Debug, Clone, Serialize, Deserialize`)
  - `pub fn clamp_minutes(m: u32) -> u32`
  - `pub fn clean_title(raw: &str) -> Option<String>`
  - `pub fn new_task(title: &str, source: TaskSource, minutes: u32) -> Option<Task>`
  - `pub fn reorder(tasks: &mut Vec<Task>, ids: &[String])`
  - `pub fn parse(raw: &str) -> Vec<Task>`, `pub fn load() -> Vec<Task>`, `pub fn save(tasks: &[Task]) -> std::io::Result<()>`

- [ ] **Step 1: Escrever os testes que falham**

`src-tauri/src/tracker/tasks.rs` (só os testes por ora):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str) -> Task {
        let mut t = new_task(id, TaskSource::Manual, 25).unwrap();
        t.id = id.to_string();
        t
    }

    fn ids(tasks: &[Task]) -> Vec<&str> {
        tasks.iter().map(|t| t.id.as_str()).collect()
    }

    fn strings(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    // The file written by focusbrew 0.1.x has no note/minutes/spent_secs.
    #[test]
    fn an_old_tasks_file_loads_with_the_new_fields_filled_in() {
        let raw = r#"[{"id":"1","title":"Escrever testes","done":true,
                       "created_at":"2026-09-10T10:00:00Z","source":"github"}]"#;
        let tasks = parse(raw);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Escrever testes");
        assert!(tasks[0].done);
        assert_eq!(tasks[0].source, TaskSource::Github);
        assert_eq!(tasks[0].minutes, 25);
        assert_eq!(tasks[0].spent_secs, 0);
        assert_eq!(tasks[0].note, None);
    }

    // Review focus: corrupted / empty files must not panic.
    #[test]
    fn empty_or_corrupted_files_become_an_empty_list() {
        assert!(parse("").is_empty());
        assert!(parse("not json").is_empty());
        assert!(parse("{\"a\":1}").is_empty());
        assert!(parse("[{\"id\":1}]").is_empty());
    }

    #[test]
    fn minutes_are_clamped_to_the_allowed_range() {
        assert_eq!(clamp_minutes(0), 5);
        assert_eq!(clamp_minutes(1), 5);
        assert_eq!(clamp_minutes(25), 25);
        assert_eq!(clamp_minutes(180), 180);
        assert_eq!(clamp_minutes(999), 180);
    }

    #[test]
    fn titles_are_trimmed_and_blank_ones_are_refused() {
        assert_eq!(clean_title("  Revisar PR  ").as_deref(), Some("Revisar PR"));
        assert_eq!(clean_title(""), None);
        assert_eq!(clean_title("   \t\n"), None);
        assert!(new_task("   ", TaskSource::Manual, 25).is_none());
    }

    // Review focus: 200 *characters*, not bytes — accents and emoji must not
    // be cut in the middle (which would panic on a byte slice).
    #[test]
    fn long_titles_are_cut_at_200_characters() {
        let long: String = "ç".repeat(250);
        let cut = clean_title(&long).unwrap();
        assert_eq!(cut.chars().count(), 200);

        let emoji: String = "🚀".repeat(300);
        assert_eq!(clean_title(&emoji).unwrap().chars().count(), 200);
    }

    #[test]
    fn a_new_task_gets_the_requested_minutes_clamped() {
        let t = new_task("x", TaskSource::Manual, 1).unwrap();
        assert_eq!(t.minutes, 5);
        assert!(!t.done);
        assert_eq!(t.spent_secs, 0);
        assert!(!t.id.is_empty());
    }

    #[test]
    fn reorder_puts_the_listed_tasks_first_in_the_given_order() {
        let mut tasks = vec![task("a"), task("b"), task("c"), task("d")];
        reorder(&mut tasks, &strings(&["c", "a"]));
        assert_eq!(ids(&tasks), vec!["c", "a", "b", "d"]);
    }

    // Review focus: a task may be removed between the drag and the drop.
    #[test]
    fn reorder_ignores_unknown_and_repeated_ids() {
        let mut tasks = vec![task("a"), task("b"), task("c")];
        reorder(&mut tasks, &strings(&["ghost", "c", "c", "a"]));
        assert_eq!(ids(&tasks), vec!["c", "a", "b"]);
    }

    #[test]
    fn reorder_with_no_ids_changes_nothing() {
        let mut tasks = vec![task("a"), task("b")];
        reorder(&mut tasks, &[]);
        assert_eq!(ids(&tasks), vec!["a", "b"]);
    }

    #[test]
    fn done_tasks_left_out_of_the_list_stay_after_the_reordered_ones() {
        let mut tasks = vec![task("a"), task("done"), task("b")];
        reorder(&mut tasks, &strings(&["b", "a"]));
        assert_eq!(ids(&tasks), vec!["b", "a", "done"]);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cargo test tracker::tasks 2>&1 | grep -E "^error" | sort | uniq -c`
Expected: erros de símbolos não encontrados (`Task`, `new_task`, `parse`, …).

- [ ] **Step 3: Implementar (acima dos testes)**

```rust
//! The tasks of the day: what they are, how they are validated and ordered,
//! and the `tasks.json` file they live in.

use std::collections::HashSet;
use std::fs;

use serde::{Deserialize, Serialize};

use crate::config::data_dir;

pub const MIN_MINUTES: u32 = 5;
pub const MAX_MINUTES: u32 = 180;
pub const DEFAULT_MINUTES: u32 = 25;
pub const MAX_TITLE_CHARS: usize = 200;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskSource {
    Manual,
    Github,
}

fn default_minutes() -> u32 {
    DEFAULT_MINUTES
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    /// One line under the title; filled for GitHub imports ("dono/repo #12").
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default = "default_minutes")]
    pub minutes: u32,
    pub done: bool,
    pub created_at: String,
    pub source: TaskSource,
    /// Total seconds worked on this task, across blocks.
    #[serde(default)]
    pub spent_secs: u32,
}

pub fn clamp_minutes(minutes: u32) -> u32 {
    minutes.clamp(MIN_MINUTES, MAX_MINUTES)
}

/// Trimmed title, at most 200 *characters*; `None` for a blank one.
pub fn clean_title(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let cut: String = trimmed.chars().take(MAX_TITLE_CHARS).collect();
    Some(cut.trim_end().to_string())
}

pub fn new_task(title: &str, source: TaskSource, minutes: u32) -> Option<Task> {
    Some(Task {
        id: uuid::Uuid::new_v4().to_string(),
        title: clean_title(title)?,
        note: None,
        minutes: clamp_minutes(minutes),
        done: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        source,
        spent_secs: 0,
    })
}

/// Puts the tasks named in `ids` first, in that order; everything else keeps
/// its relative order after them. Unknown and repeated ids are ignored.
pub fn reorder(tasks: &mut Vec<Task>, ids: &[String]) {
    let mut remaining = std::mem::take(tasks);
    let mut seen = HashSet::new();
    let mut ordered = Vec::with_capacity(remaining.len());
    for id in ids {
        if !seen.insert(id.as_str()) {
            continue;
        }
        if let Some(pos) = remaining.iter().position(|t| &t.id == id) {
            ordered.push(remaining.remove(pos));
        }
    }
    ordered.extend(remaining);
    *tasks = ordered;
}

fn tasks_path() -> std::path::PathBuf {
    data_dir().join("tasks.json")
}

pub fn parse(raw: &str) -> Vec<Task> {
    serde_json::from_str(raw).unwrap_or_default()
}

pub fn load() -> Vec<Task> {
    match fs::read_to_string(tasks_path()) {
        Ok(raw) => parse(&raw),
        Err(_) => Vec::new(),
    }
}

pub fn save(tasks: &[Task]) -> std::io::Result<()> {
    let raw = serde_json::to_string_pretty(tasks)?;
    fs::write(tasks_path(), raw)
}
```

Em `tracker/mod.rs`, acrescentar `pub mod tasks;` (depois de `pub mod timer;`, mantendo a ordem alfabética: `tasks` antes de `timer`).

- [ ] **Step 4: Rodar e ver passar**

Run: `cargo test tracker::tasks`
Expected: `test result: ok. 10 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tracker
git commit -m "feat: task model with minutes, notes, reordering and safe parsing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Atividade por dia (`tracker/activity.rs`)

**Files:**
- Create: `src-tauri/src/tracker/activity.rs`
- Modify: `src-tauri/src/tracker/mod.rs` (declarar `pub mod activity;`)

**Interfaces:**
- Consumes: `crate::config::data_dir()`.
- Produces (`crate::tracker::activity`):
  - `pub struct ActivityLog { pub focus_secs_by_day: HashMap<String, u32> }` (`Debug, Clone, Default, Serialize, Deserialize`)
  - `ActivityLog::add_focus_secs(&mut self, day: &str, secs: u32)` (`secs == 0` não faz nada; soma saturada)
  - `pub fn parse(raw: &str) -> ActivityLog`, `pub fn load() -> ActivityLog`, `pub fn save(log: &ActivityLog) -> std::io::Result<()>`

- [ ] **Step 1: Escrever os testes que falham**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seconds_add_up_within_a_day() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("2026-10-05", 600);
        log.add_focus_secs("2026-10-05", 300);
        log.add_focus_secs("2026-10-06", 60);
        assert_eq!(log.focus_secs_by_day["2026-10-05"], 900);
        assert_eq!(log.focus_secs_by_day["2026-10-06"], 60);
    }

    #[test]
    fn zero_seconds_leave_no_entry() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("2026-10-05", 0);
        assert!(log.focus_secs_by_day.is_empty());
    }

    #[test]
    fn the_sum_never_overflows() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("d", u32::MAX);
        log.add_focus_secs("d", 10);
        assert_eq!(log.focus_secs_by_day["d"], u32::MAX);
    }

    // The 0.1.x file has `days`, `sessions` and `app_seconds_*`; none of it is
    // read any more, and loading it must not fail.
    #[test]
    fn an_old_activity_file_loads_as_empty() {
        let raw = r#"{"days":{"2026-09-09":3},"sessions":[],
                      "app_seconds_today":{"Code.exe":120},"app_seconds_day":"2026-09-09"}"#;
        assert!(parse(raw).focus_secs_by_day.is_empty());
    }

    // Review focus: corrupted / empty files must not panic.
    #[test]
    fn empty_or_corrupted_files_become_an_empty_log() {
        assert!(parse("").focus_secs_by_day.is_empty());
        assert!(parse("garbage").focus_secs_by_day.is_empty());
        assert!(parse("[1,2,3]").focus_secs_by_day.is_empty());
    }

    #[test]
    fn a_saved_log_reads_back_the_same() {
        let mut log = ActivityLog::default();
        log.add_focus_secs("2026-10-05", 1500);
        let raw = serde_json::to_string(&log).unwrap();
        assert_eq!(parse(&raw).focus_secs_by_day["2026-10-05"], 1500);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cargo test tracker::activity 2>&1 | grep -E "^error" | sort | uniq -c`
Expected: símbolos não encontrados.

- [ ] **Step 3: Implementar**

```rust
//! Seconds of focus per day — what the Activity grid shows.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::data_dir;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ActivityLog {
    /// "AAAA-MM-DD" (local date of the day the block *ended*) -> seconds.
    /// The fields the 0.1.x file had (`days`, `sessions`, `app_seconds_*`) are
    /// ignored on load and dropped on the next save.
    #[serde(default)]
    pub focus_secs_by_day: HashMap<String, u32>,
}

impl ActivityLog {
    pub fn add_focus_secs(&mut self, day: &str, secs: u32) {
        if secs == 0 {
            return;
        }
        let total = self.focus_secs_by_day.entry(day.to_string()).or_insert(0);
        *total = total.saturating_add(secs);
    }
}

fn log_path() -> PathBuf {
    data_dir().join("activity.json")
}

pub fn parse(raw: &str) -> ActivityLog {
    serde_json::from_str(raw).unwrap_or_default()
}

pub fn load() -> ActivityLog {
    match fs::read_to_string(log_path()) {
        Ok(raw) => parse(&raw),
        Err(_) => ActivityLog::default(),
    }
}

pub fn save(log: &ActivityLog) -> std::io::Result<()> {
    let raw = serde_json::to_string_pretty(log)?;
    fs::write(log_path(), raw)
}
```

Em `tracker/mod.rs`, acrescentar `pub mod activity;` como primeira linha de `pub mod` (ordem alfabética: `activity`, `tasks`, `timer`).

- [ ] **Step 4: Rodar e ver passar**

Run: `cargo test tracker::activity`
Expected: `test result: ok. 6 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tracker
git commit -m "feat: per-day focus seconds log" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `Tracker` — timer, tarefas e atividade juntos (`tracker/mod.rs`)

**Files:**
- Modify: `src-tauri/src/tracker/mod.rs`

**Interfaces:**
- Consumes: `timer::{Timer, SLEEP_GAP_MS}`, `tasks::{Task, clamp_minutes}`, `activity::ActivityLog`.
- Produces (`crate::tracker`):
  - `pub fn now_ms() -> i64`, `pub fn today_key() -> String` (data local `AAAA-MM-DD`)
  - `pub struct Finished { pub title: String, pub secs: u32 }` (`Debug, Clone, PartialEq, Eq`)
  - `pub struct Tracker { pub timer: Timer, pub tasks: Vec<Task>, pub log: ActivityLog }`
  - `Tracker::new(tasks: Vec<Task>, log: ActivityLog) -> Tracker`
  - `start_task(&mut self, id: &str, now_ms: i64, today: &str) -> Result<(), String>`
  - `toggle_pause(&mut self, now_ms: i64)`
  - `stop(&mut self, now_ms: i64, today: &str)`
  - `set_minutes(&mut self, id: &str, minutes: u32, now_ms: i64, today: &str) -> Option<Finished>`
  - `toggle_task(&mut self, id: &str, now_ms: i64, today: &str)`
  - `remove_task(&mut self, id: &str, now_ms: i64, today: &str)`
  - `tick(&mut self, now_ms: i64, last_tick_ms: i64, today: &str) -> Option<Finished>`
  - `first_open_task(&self) -> Option<String>`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `tracker/mod.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tasks::TaskSource;

    const T0: i64 = 1_000_000_000_000;
    const MIN: i64 = 60_000;
    const DAY: &str = "2026-10-05";

    fn tracker(tasks: &[(&str, u32)]) -> Tracker {
        let list = tasks
            .iter()
            .map(|(id, minutes)| {
                let mut t = tasks::new_task(id, TaskSource::Manual, *minutes).unwrap();
                t.id = id.to_string();
                t
            })
            .collect();
        Tracker::new(list, ActivityLog::default())
    }

    fn day_secs(tr: &Tracker, day: &str) -> u32 {
        *tr.log.focus_secs_by_day.get(day).unwrap_or(&0)
    }

    fn spent(tr: &Tracker, id: &str) -> u32 {
        tr.tasks.iter().find(|t| t.id == id).unwrap().spent_secs
    }

    fn minutes(tr: &Tracker, id: &str) -> u32 {
        tr.tasks.iter().find(|t| t.id == id).unwrap().minutes
    }

    #[test]
    fn stopping_early_keeps_the_time_worked() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.stop(T0 + 10 * MIN, DAY);
        assert_eq!(spent(&tr, "a"), 600);
        assert_eq!(day_secs(&tr, DAY), 600);
        assert_eq!(tr.timer, Timer::Idle);
    }

    #[test]
    fn stopping_the_same_instant_records_nothing() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.stop(T0, DAY);
        assert!(!tr.log.focus_secs_by_day.contains_key(DAY));
        assert_eq!(spent(&tr, "a"), 0);
    }

    #[test]
    fn starting_another_task_closes_the_first_one() {
        let mut tr = tracker(&[("a", 25), ("b", 10)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.start_task("b", T0 + 5 * MIN, DAY).unwrap();
        assert_eq!(spent(&tr, "a"), 300);
        assert_eq!(tr.timer.task_id(), Some("b"));
        assert_eq!(tr.timer.planned_secs(), 600);
    }

    #[test]
    fn play_on_the_running_task_changes_nothing() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let before = tr.timer.clone();
        tr.start_task("a", T0 + 5 * MIN, DAY).unwrap();
        assert_eq!(tr.timer, before);
        assert_eq!(spent(&tr, "a"), 0);
    }

    #[test]
    fn play_on_a_paused_task_resumes_it() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.toggle_pause(T0 + 5 * MIN);
        tr.start_task("a", T0 + 8 * MIN, DAY).unwrap();
        assert_eq!(
            tr.timer,
            Timer::Running { task_id: "a".into(), planned_secs: 1500, deadline_ms: T0 + 8 * MIN + 20 * MIN }
        );
    }

    #[test]
    fn a_done_or_unknown_task_cannot_be_started() {
        let mut tr = tracker(&[("a", 25)]);
        tr.toggle_task("a", T0, DAY);
        assert!(tr.start_task("a", T0, DAY).is_err());
        assert!(tr.start_task("ghost", T0, DAY).is_err());
        assert_eq!(tr.timer, Timer::Idle);
    }

    #[test]
    fn paused_time_does_not_count() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.toggle_pause(T0 + MIN); // 60 s worked
        tr.toggle_pause(T0 + 61 * MIN); // an hour later
        tr.stop(T0 + 61 * MIN + 30_000, DAY); // 30 s more
        assert_eq!(spent(&tr, "a"), 90);
    }

    #[test]
    fn pausing_when_idle_does_nothing() {
        let mut tr = tracker(&[("a", 25)]);
        tr.toggle_pause(T0);
        assert_eq!(tr.timer, Timer::Idle);
    }

    #[test]
    fn changing_the_minutes_of_the_running_task_rebases_the_block() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let finished = tr.set_minutes("a", 45, T0 + 10 * MIN, DAY);
        assert_eq!(finished, None);
        assert_eq!(minutes(&tr, "a"), 45);
        assert_eq!(tr.timer.remaining_secs(T0 + 10 * MIN), 35 * 60);
    }

    #[test]
    fn shrinking_the_running_task_below_the_time_worked_finishes_it() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let finished = tr.set_minutes("a", 5, T0 + 10 * MIN, DAY);
        assert_eq!(finished, Some(Finished { title: "a".into(), secs: 300 }));
        assert_eq!(spent(&tr, "a"), 300);
        assert_eq!(tr.timer, Timer::Idle);
        assert!(!tr.tasks[0].done, "finishing a block never checks the task off");
    }

    #[test]
    fn minutes_are_clamped_and_idle_tasks_are_only_edited() {
        let mut tr = tracker(&[("a", 25)]);
        assert_eq!(tr.set_minutes("a", 1, T0, DAY), None);
        assert_eq!(minutes(&tr, "a"), 5);
        tr.set_minutes("a", 999, T0, DAY);
        assert_eq!(minutes(&tr, "a"), 180);
        assert_eq!(tr.timer, Timer::Idle);
        assert_eq!(tr.set_minutes("ghost", 30, T0, DAY), None);
    }

    #[test]
    fn checking_off_the_running_task_stops_it_and_keeps_the_time() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.toggle_task("a", T0 + 7 * MIN, DAY);
        assert!(tr.tasks[0].done);
        assert_eq!(spent(&tr, "a"), 420);
        assert_eq!(tr.timer, Timer::Idle);
    }

    #[test]
    fn checking_off_another_task_leaves_the_timer_alone() {
        let mut tr = tracker(&[("a", 25), ("b", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let before = tr.timer.clone();
        tr.toggle_task("b", T0 + MIN, DAY);
        assert_eq!(tr.timer, before);
    }

    #[test]
    fn unchecking_a_task_brings_it_back() {
        let mut tr = tracker(&[("a", 25)]);
        tr.toggle_task("a", T0, DAY);
        tr.toggle_task("a", T0, DAY);
        assert!(!tr.tasks[0].done);
    }

    #[test]
    fn removing_the_running_task_keeps_the_day_total() {
        let mut tr = tracker(&[("a", 25), ("b", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.remove_task("a", T0 + 4 * MIN, DAY);
        assert_eq!(tr.tasks.len(), 1);
        assert_eq!(tr.timer, Timer::Idle);
        assert_eq!(day_secs(&tr, DAY), 240);
    }

    #[test]
    fn removing_another_task_leaves_the_timer_alone() {
        let mut tr = tracker(&[("a", 25), ("b", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.remove_task("b", T0 + MIN, DAY);
        assert_eq!(tr.timer.task_id(), Some("a"));
    }

    #[test]
    fn reaching_zero_records_the_planned_time_and_leaves_the_task_open() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let finished = tr.tick(T0 + 25 * MIN, T0 + 25 * MIN - 1000, DAY);
        assert_eq!(finished, Some(Finished { title: "a".into(), secs: 1500 }));
        assert_eq!(spent(&tr, "a"), 1500);
        assert_eq!(day_secs(&tr, DAY), 1500);
        assert_eq!(tr.timer, Timer::Idle);
        assert!(!tr.tasks[0].done);
    }

    #[test]
    fn a_tick_before_the_deadline_does_nothing() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        assert_eq!(tr.tick(T0 + 10 * MIN, T0 + 10 * MIN - 1000, DAY), None);
        assert_eq!(tr.timer.task_id(), Some("a"));
    }

    #[test]
    fn a_paused_timer_does_not_finish_on_tick() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        tr.toggle_pause(T0 + MIN);
        assert_eq!(tr.tick(T0 + 100 * MIN, T0 + 99 * MIN, DAY), None);
    }

    #[test]
    fn a_long_gap_means_the_computer_slept_and_does_not_count() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        // 3 hours pass between two checks (sleep)
        let last = T0 + 1000;
        let now = T0 + 3 * 60 * MIN;
        assert_eq!(tr.tick(now, last, DAY), None);
        // the block still has (almost) all of its time left
        assert_eq!(tr.timer.remaining_secs(now), 25 * 60 - 1);
    }

    #[test]
    fn a_gap_of_exactly_the_limit_still_counts_as_time() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, DAY).unwrap();
        let before = tr.timer.clone();
        assert_eq!(tr.tick(T0 + SLEEP_GAP_MS, T0, DAY), None);
        assert_eq!(tr.timer, before);
    }

    // Review focus: a block that crosses midnight belongs to the day it ends.
    #[test]
    fn the_day_comes_from_when_the_block_ends() {
        let mut tr = tracker(&[("a", 25)]);
        tr.start_task("a", T0, "2026-10-05").unwrap();
        tr.stop(T0 + 20 * MIN, "2026-10-06");
        assert_eq!(day_secs(&tr, "2026-10-06"), 1200);
        assert_eq!(day_secs(&tr, "2026-10-05"), 0);
    }

    #[test]
    fn first_open_task_skips_done_ones() {
        let mut tr = tracker(&[("a", 25), ("b", 25)]);
        assert_eq!(tr.first_open_task().as_deref(), Some("a"));
        tr.toggle_task("a", T0, DAY);
        assert_eq!(tr.first_open_task().as_deref(), Some("b"));
        tr.toggle_task("b", T0, DAY);
        assert_eq!(tr.first_open_task(), None);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cargo test tracker::tests 2>&1 | grep -E "^error" | sort | uniq -c`
Expected: `cannot find type Tracker`, `Finished` etc.

- [ ] **Step 3: Implementar (entre as linhas `pub mod ...;` e o bloco de testes)**

```rust
use activity::ActivityLog;
use tasks::{clamp_minutes, Task};
use timer::{Timer, SLEEP_GAP_MS};

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Today's local date, "AAAA-MM-DD" — the key of `focus_secs_by_day`.
pub fn today_key() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// A block that ran to its end (or was cut to a length already used up).
/// The caller turns it into a notification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finished {
    pub title: String,
    pub secs: u32,
}

pub struct Tracker {
    pub timer: Timer,
    pub tasks: Vec<Task>,
    pub log: ActivityLog,
}

impl Tracker {
    pub fn new(tasks: Vec<Task>, log: ActivityLog) -> Self {
        Tracker { timer: Timer::Idle, tasks, log }
    }

    pub fn first_open_task(&self) -> Option<String> {
        self.tasks.iter().find(|t| !t.done).map(|t| t.id.clone())
    }

    /// Adds worked seconds to the task and to the day's total.
    fn record(&mut self, task_id: &str, secs: u32, today: &str) {
        if secs == 0 {
            return;
        }
        if let Some(task) = self.tasks.iter_mut().find(|t| t.id == task_id) {
            task.spent_secs = task.spent_secs.saturating_add(secs);
        }
        self.log.add_focus_secs(today, secs);
    }

    /// Ends the active block counting `secs` as worked.
    fn finish(&mut self, task_id: &str, secs: u32, today: &str) -> Finished {
        let title = self
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .map(|t| t.title.clone())
            .unwrap_or_default();
        self.record(task_id, secs, today);
        self.timer = Timer::Idle;
        Finished { title, secs }
    }

    /// Ends whatever is running, keeping the time actually worked.
    pub fn stop(&mut self, now_ms: i64, today: &str) {
        if let Some(id) = self.timer.task_id().map(str::to_string) {
            let secs = self.timer.elapsed_secs(now_ms);
            self.record(&id, secs, today);
        }
        self.timer = Timer::Idle;
    }

    pub fn start_task(&mut self, id: &str, now_ms: i64, today: &str) -> Result<(), String> {
        let task = self
            .tasks
            .iter()
            .find(|t| t.id == id)
            .ok_or_else(|| "tarefa não encontrada".to_string())?;
        if task.done {
            return Err("tarefa já concluída".to_string());
        }
        let planned_secs = task.minutes * 60;

        if self.timer.task_id() == Some(id) {
            // Already the active task: running stays as is, paused resumes.
            self.timer.resume(now_ms);
            return Ok(());
        }
        self.stop(now_ms, today);
        self.timer = Timer::start(id, planned_secs, now_ms);
        Ok(())
    }

    pub fn toggle_pause(&mut self, now_ms: i64) {
        match self.timer.status() {
            timer::TimerStatus::Running => self.timer.pause(now_ms),
            timer::TimerStatus::Paused => self.timer.resume(now_ms),
            timer::TimerStatus::Idle => {}
        }
    }

    /// Edits a task's minutes. If it is the active task, the block is
    /// re-based; a length already used up ends the block (`Some(Finished)`).
    pub fn set_minutes(
        &mut self,
        id: &str,
        minutes: u32,
        now_ms: i64,
        today: &str,
    ) -> Option<Finished> {
        let minutes = clamp_minutes(minutes);
        {
            let task = self.tasks.iter_mut().find(|t| t.id == id)?;
            task.minutes = minutes;
        }
        if self.timer.task_id() != Some(id) {
            return None;
        }
        let planned_secs = minutes * 60;
        if self.timer.set_planned(planned_secs, now_ms) {
            return Some(self.finish(id, planned_secs, today));
        }
        None
    }

    pub fn toggle_task(&mut self, id: &str, now_ms: i64, today: &str) {
        let now_done = {
            let Some(task) = self.tasks.iter_mut().find(|t| t.id == id) else {
                return;
            };
            task.done = !task.done;
            task.done
        };
        if now_done && self.timer.task_id() == Some(id) {
            self.stop(now_ms, today);
        }
    }

    pub fn remove_task(&mut self, id: &str, now_ms: i64, today: &str) {
        if self.timer.task_id() == Some(id) {
            self.stop(now_ms, today);
        }
        self.tasks.retain(|t| t.id != id);
    }

    /// Called once a second. A gap longer than `SLEEP_GAP_MS` since the last
    /// call means the computer slept: that time is not work, so a running
    /// deadline moves later by the gap. Returns the block that just ended.
    pub fn tick(&mut self, now_ms: i64, last_tick_ms: i64, today: &str) -> Option<Finished> {
        let gap = now_ms - last_tick_ms;
        if gap > SLEEP_GAP_MS {
            self.timer.shift_deadline(gap);
        }
        if !self.timer.is_expired(now_ms) {
            return None;
        }
        let id = self.timer.task_id()?.to_string();
        let secs = self.timer.planned_secs();
        Some(self.finish(&id, secs, today))
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cargo test tracker`
Expected: `test result: ok. 53 passed` (14 do timer + 10 de tarefas + 6 de atividade + 23 do `Tracker`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tracker
git commit -m "feat: tracker combining timer, tasks and per-day activity" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Configurações novas (aditivo, em `config.rs`)

Os campos novos entram **ao lado** dos antigos; os antigos só saem na Task 7 (o resto do app ainda os usa).

**Files:**
- Modify: `src-tauri/src/config.rs`

**Interfaces:**
- Consumes: `crate::tracker::tasks::{clamp_minutes, DEFAULT_MINUTES}`.
- Produces (`crate::config`):
  - `pub enum NotchStyle { Standard, Minimal }` (`Copy`, `Default = Standard`, serde minúsculo)
  - `pub enum WidgetScale { Small, Medium, Large }` (`Copy`, `Default = Medium`, serde minúsculo) com `pub fn factor(self) -> f64` (0,85 / 1,0 / 1,25)
  - `pub const DEFAULT_ACCENT: &str = "#0A84FF"`
  - `pub fn normalize_hex(raw: &str) -> Option<String>` (`#rrggbb` em qualquer caixa → `#RRGGBB`; resto → `None`)
  - campos novos de `AppConfig`: `default_minutes: u32`, `notify_on_finish: bool`, `notch_style: NotchStyle`, `progress_line: bool`, `rgb_line: bool`, `accent_color: String`, `widget_scale: WidgetScale`, `widget_visible: bool`
  - `AppConfig::normalized(self) -> AppConfig`, `pub fn parse(raw: &str) -> AppConfig`

- [ ] **Step 1: Escrever os testes que falham**

Dentro do bloco `#[cfg(test)] mod tests { ... }` que já existe no fim de `config.rs`, acrescentar (depois dos dois testes que já estão lá):

```rust
    #[test]
    fn the_new_settings_have_the_agreed_defaults() {
        let c = AppConfig::default();
        assert_eq!(c.default_minutes, 25);
        assert!(c.notify_on_finish);
        assert_eq!(c.notch_style, NotchStyle::Standard);
        assert!(c.progress_line);
        assert!(!c.rgb_line);
        assert_eq!(c.accent_color, "#0A84FF");
        assert_eq!(c.widget_scale, WidgetScale::Medium);
        assert!(c.widget_visible);
    }

    // The file focusbrew 0.1.x wrote: old fields only.
    #[test]
    fn a_0_1_settings_file_keeps_its_values_and_gets_the_new_defaults() {
        let raw = r##"{
            "monitored_processes": ["Code.exe"], "blocked_apps": ["Discord.exe"],
            "poll_interval_secs": 3, "focus_auto_enable": false,
            "block_apps_enabled": true, "dnd_enabled": false,
            "timer": { "focus_minutes": 25, "break_minutes": 5, "auto_start": true },
            "github_login": "someone", "ring_color": "#ff0000", "github_use_gh": false
        }"##;
        let c = parse(raw);
        assert_eq!(c.github_login.as_deref(), Some("someone"));
        assert!(!c.github_use_gh);
        assert_eq!(c.accent_color, "#0A84FF");
        assert_eq!(c.default_minutes, 25);
    }

    #[test]
    fn a_partial_file_fills_the_rest_with_defaults() {
        let c = parse(r##"{"accent_color":"#112233","rgb_line":true}"##);
        assert_eq!(c.accent_color, "#112233");
        assert!(c.rgb_line);
        assert_eq!(c.default_minutes, 25);
        assert!(c.progress_line);
    }

    // Review focus: truncated / empty / garbage settings must not panic.
    #[test]
    fn empty_or_corrupted_files_become_the_defaults() {
        for raw in ["", "garbage", "{", "[1,2]", "{\"default_minutes\":\"x\"}"] {
            let c = parse(raw);
            assert_eq!(c.accent_color, "#0A84FF", "input: {raw:?}");
            assert_eq!(c.default_minutes, 25, "input: {raw:?}");
        }
    }

    #[test]
    fn an_invalid_accent_falls_back_to_the_default() {
        for bad in ["red", "#12345", "#1234567", "#GGGGGG", "", "0A84FF", "#0A84F"] {
            let c = AppConfig { accent_color: bad.to_string(), ..AppConfig::default() }.normalized();
            assert_eq!(c.accent_color, "#0A84FF", "input: {bad:?}");
        }
    }

    #[test]
    fn a_valid_accent_is_written_in_upper_case() {
        let c = AppConfig { accent_color: " #ff9f0a ".to_string(), ..AppConfig::default() }.normalized();
        assert_eq!(c.accent_color, "#FF9F0A");
    }

    #[test]
    fn default_minutes_are_clamped() {
        let low = AppConfig { default_minutes: 0, ..AppConfig::default() }.normalized();
        let high = AppConfig { default_minutes: 5000, ..AppConfig::default() }.normalized();
        assert_eq!((low.default_minutes, high.default_minutes), (5, 180));
    }

    #[test]
    fn the_scales_are_small_medium_large() {
        assert_eq!(WidgetScale::Small.factor(), 0.85);
        assert_eq!(WidgetScale::Medium.factor(), 1.0);
        assert_eq!(WidgetScale::Large.factor(), 1.25);
    }

    #[test]
    fn the_enums_are_written_in_lower_case() {
        assert_eq!(serde_json::to_string(&NotchStyle::Minimal).unwrap(), "\"minimal\"");
        assert_eq!(serde_json::to_string(&WidgetScale::Large).unwrap(), "\"large\"");
    }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cargo test config:: 2>&1 | grep -E "^error" | sort | uniq -c`
Expected: erros de campos/tipos inexistentes (`NotchStyle`, `default_minutes`, `parse`…).

- [ ] **Step 3: Implementar**

Em `config.rs`:

1. Acrescentar o import junto dos outros `use` do topo:

```rust
use crate::tracker::tasks::{clamp_minutes, DEFAULT_MINUTES};
```

2. Acima de `pub struct AppConfig`, os enums e funções novas:

```rust
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotchStyle {
    /// Countdown on the left, task name on the right.
    #[default]
    Standard,
    /// Only the box and the progress line.
    Minimal,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WidgetScale {
    Small,
    #[default]
    Medium,
    Large,
}

impl WidgetScale {
    pub fn factor(self) -> f64 {
        match self {
            WidgetScale::Small => 0.85,
            WidgetScale::Medium => 1.0,
            WidgetScale::Large => 1.25,
        }
    }
}

pub const DEFAULT_ACCENT: &str = "#0A84FF";

/// "#rrggbb" in any case (and surrounding spaces) -> "#RRGGBB"; anything else -> `None`.
pub fn normalize_hex(raw: &str) -> Option<String> {
    let hex = raw.trim().strip_prefix('#')?;
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(format!("#{}", hex.to_ascii_uppercase()))
    } else {
        None
    }
}
```

3. Na struct `AppConfig`: acrescentar `#[serde(default)]` logo abaixo do `#[derive(...)]` (assim um arquivo antigo ou parcial usa `AppConfig::default()` pro que faltar) e, **depois do campo `github_use_gh`**, os campos novos:

```rust
    /// Minutes given to a new task.
    pub default_minutes: u32,
    /// Notification when a block runs to its end.
    pub notify_on_finish: bool,
    pub notch_style: NotchStyle,
    /// The line that fills around the widget while a block runs.
    pub progress_line: bool,
    /// Rainbow instead of the accent color on that line.
    pub rgb_line: bool,
    /// "#RRGGBB"; invalid values are replaced by `DEFAULT_ACCENT`.
    pub accent_color: String,
    pub widget_scale: WidgetScale,
    pub widget_visible: bool,
```

4. No `impl Default for AppConfig`, acrescentar ao fim da lista de campos (depois de `github_use_gh: true,`):

```rust
            default_minutes: DEFAULT_MINUTES,
            notify_on_finish: true,
            notch_style: NotchStyle::default(),
            progress_line: true,
            rgb_line: false,
            accent_color: DEFAULT_ACCENT.to_string(),
            widget_scale: WidgetScale::default(),
            widget_visible: true,
```

5. Depois do `impl Default`, o `normalized` e o `parse`, e fazer `load()` usar `parse`:

```rust
impl AppConfig {
    /// Brings values into their allowed range (called on load and on every
    /// save from the settings window).
    pub fn normalized(mut self) -> Self {
        self.default_minutes = clamp_minutes(self.default_minutes);
        self.accent_color =
            normalize_hex(&self.accent_color).unwrap_or_else(|| DEFAULT_ACCENT.to_string());
        self
    }
}

/// Reads a settings file's text; anything unreadable becomes the defaults.
pub fn parse(raw: &str) -> AppConfig {
    serde_json::from_str::<AppConfig>(raw).unwrap_or_default().normalized()
}
```

Em `pub fn load()`, trocar `Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),` por `Ok(raw) => parse(&raw),`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cargo test config::`
Expected: `0 failed` (os 2 testes antigos + os 9 novos passam).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat: notch, accent and default-minutes settings with safe parsing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Layout do widget (contas puras em `widget.rs`)

Aditivo: o código antigo de `widget.rs` continua; a Task 7 troca a parte que mexe na janela.

**Files:**
- Modify: `src-tauri/src/widget.rs`

**Interfaces:**
- Consumes: `AppConfig` (`widget_scale`, `widget_visible`), `TimerStatus`.
- Produces (`crate::widget`):
  - `pub const IDLE_SIZE: (f64, f64) = (140.0, 14.0); RUNNING_SIZE = (320.0, 44.0); OPEN_SIZE = (470.0, 230.0);`
  - `pub struct Layout { pub width: f64, pub height: f64, pub visible: bool }` (`Debug, Clone, Copy, PartialEq`)
  - `pub fn layout_for(config: &AppConfig, status: TimerStatus, expanded: bool) -> Layout`
  - `pub fn top_center_x(monitor_x: f64, monitor_width: f64, window_width: f64) -> f64`
  - `pub fn logical_monitor(x: i32, y: i32, width: u32, scale: f64) -> (f64, f64, f64)` (origem x, origem y e largura em pixels lógicos)

- [ ] **Step 1: Escrever os testes que falham**

No fim de `widget.rs`:

```rust
#[cfg(test)]
mod layout_tests {
    use super::*;
    use crate::config::{AppConfig, WidgetScale};

    fn cfg(scale: WidgetScale) -> AppConfig {
        AppConfig { widget_scale: scale, ..AppConfig::default() }
    }

    #[test]
    fn medium_sizes_follow_the_state() {
        let c = cfg(WidgetScale::Medium);
        let at = |status, expanded| {
            let l = layout_for(&c, status, expanded);
            (l.width, l.height)
        };
        assert_eq!(at(TimerStatus::Idle, false), (140.0, 14.0));
        assert_eq!(at(TimerStatus::Running, false), (320.0, 44.0));
        assert_eq!(at(TimerStatus::Paused, false), (320.0, 44.0));
    }

    #[test]
    fn the_open_panel_wins_over_the_timer_state() {
        let c = cfg(WidgetScale::Medium);
        for status in [TimerStatus::Idle, TimerStatus::Running, TimerStatus::Paused] {
            let l = layout_for(&c, status, true);
            assert_eq!((l.width, l.height), (470.0, 230.0));
        }
    }

    #[test]
    fn small_and_large_scale_every_size() {
        let small = layout_for(&cfg(WidgetScale::Small), TimerStatus::Idle, false);
        assert_eq!((small.width, small.height), (119.0, 12.0));
        let small_run = layout_for(&cfg(WidgetScale::Small), TimerStatus::Running, false);
        assert_eq!((small_run.width, small_run.height), (272.0, 37.0));

        let large = layout_for(&cfg(WidgetScale::Large), TimerStatus::Running, true);
        assert_eq!((large.width, large.height), (588.0, 288.0));
    }

    #[test]
    fn visibility_follows_the_setting() {
        let hidden = AppConfig { widget_visible: false, ..AppConfig::default() };
        assert!(!layout_for(&hidden, TimerStatus::Idle, false).visible);
        assert!(layout_for(&AppConfig::default(), TimerStatus::Idle, false).visible);
    }

    #[test]
    fn the_window_is_centered_on_the_monitor() {
        assert_eq!(top_center_x(0.0, 1920.0, 320.0), 800.0);
        assert_eq!(top_center_x(0.0, 1366.0, 320.0), 523.0);
        // odd leftover pixel: never a half pixel
        assert_eq!(top_center_x(0.0, 1367.0, 320.0), 523.0);
    }

    // Review focus: a second monitor to the left of the main one has a
    // negative origin; the widget must follow the monitor, not (0, 0).
    #[test]
    fn a_monitor_with_a_negative_origin_keeps_the_widget_on_it() {
        assert_eq!(top_center_x(-1920.0, 1920.0, 320.0), -1120.0);
    }

    // Review focus: at 150 % the monitor is 2880 physical px = 1920 logical.
    #[test]
    fn physical_monitor_values_become_logical_ones() {
        assert_eq!(logical_monitor(0, 0, 2880, 1.5), (0.0, 0.0, 1920.0));
        assert_eq!(logical_monitor(-2880, 120, 2880, 1.5), (-1920.0, 80.0, 1920.0));
    }

    #[test]
    fn a_zero_or_negative_scale_factor_is_treated_as_one() {
        assert_eq!(logical_monitor(10, 20, 1000, 0.0), (10.0, 20.0, 1000.0));
        assert_eq!(logical_monitor(10, 20, 1000, -2.0), (10.0, 20.0, 1000.0));
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cargo test layout_tests 2>&1 | grep -E "^error" | sort | uniq -c`
Expected: `cannot find function layout_for` etc.

- [ ] **Step 3: Implementar**

No topo de `widget.rs`, acrescentar aos `use` existentes:

```rust
use crate::config::AppConfig;
use crate::tracker::timer::TimerStatus;
```

E, depois das constantes antigas, o código novo:

```rust
/// Parked: a flat bar at the very top of the screen (the 14 px tall window
/// is the area that reacts to the mouse; the bar itself is 6 px).
pub const IDLE_SIZE: (f64, f64) = (140.0, 14.0);
/// A block is running or paused: the box with the progress line around it.
pub const RUNNING_SIZE: (f64, f64) = (320.0, 44.0);
/// The To Do + Activity panel.
pub const OPEN_SIZE: (f64, f64) = (470.0, 230.0);

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Layout {
    pub width: f64,
    pub height: f64,
    pub visible: bool,
}

/// Window size (logical px, already scaled) and visibility for a given state.
pub fn layout_for(config: &AppConfig, status: TimerStatus, expanded: bool) -> Layout {
    let (w, h) = if expanded {
        OPEN_SIZE
    } else if status == TimerStatus::Idle {
        IDLE_SIZE
    } else {
        RUNNING_SIZE
    };
    let scale = config.widget_scale.factor();
    Layout {
        width: (w * scale).round(),
        height: (h * scale).round(),
        visible: config.widget_visible,
    }
}

/// Left edge that centers a window of `window_width` on a monitor; the
/// monitor's own origin is added so a monitor at a negative x still works.
pub fn top_center_x(monitor_x: f64, monitor_width: f64, window_width: f64) -> f64 {
    monitor_x + ((monitor_width - window_width) / 2.0).floor()
}

/// A monitor's origin and width in logical pixels, from its physical values.
pub fn logical_monitor(x: i32, y: i32, width: u32, scale: f64) -> (f64, f64, f64) {
    let s = if scale > 0.0 { scale } else { 1.0 };
    (x as f64 / s, y as f64 / s, width as f64 / s)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cargo test layout_tests`
Expected: `test result: ok. 8 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/widget.rs
git commit -m "feat: pure widget layout (sizes per state and scale, top-center position)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Corte — o app novo no backend, o foco antigo removido

Esta é a única tarefa grande: o app tem que compilar de novo no fim dela, então o backend e o mínimo do front-end (tipos, IPC, duas telas provisórias) mudam juntos. As telas de verdade vêm nas Tasks 9–11.

**Files:**
- Delete: `src-tauri/src/{detector.rs,focus.rs,timer.rs,tasks.rs,activity.rs}`, `src-tauri/src/platform/` (pasta), `src-tauri/icons/tray/{focus.png,working.png,coffee.png}`, `src/components/{Dashboard.tsx,TaskBoard.tsx,Settings.tsx}`, `src/lib/{appIcons.ts,heatmap.ts}`, `src/App.css` (o CSS antigo vazaria pro widget; a Task 11 cria um novo, escopado)
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/{config.rs,state.rs,commands.rs,widget.rs,lib.rs}`, `src-tauri/src/tracker/mod.rs`, `src/lib/{types.ts,tauri.ts}`, `src/App.tsx`, `src/Widget.tsx`, `src/components/GithubPanel.tsx`

**Interfaces:**
- Consumes: tudo das Tasks 1–6.
- Produces (backend):
  - `crate::state::{AppState { config, tracker, last_tick_ms, github_items, github_error, github_days, github_source }, StateSnapshot { tasks, timer: TimerView, focus_secs_by_day, config, github_items, github_error, github_days, github_source }}`; `AppState::save_tracker(&self)`
  - `crate::{notify(app, title, body), notify_finished(app, &Finished), sync_ui(app, &AppState), show_main_window(app), Shared}`
  - `crate::widget::{create(app), apply(app, Layout), set_expanded(bool), is_expanded() -> bool}`
  - comandos IPC: `get_state`, `add_task(title)`, `toggle_task(id)`, `remove_task(id)`, `update_task_minutes(id, minutes)`, `reorder_tasks(ids)`, `start_task(id)`, `toggle_pause()`, `stop_timer()`, `update_settings(newConfig)`, `set_widget_expanded(expanded)`, `open_settings_window()`, `import_github_item_as_task(title, note)`, mais os do GitHub que já existem
- Produces (front-end, `src/lib/tauri.ts` e `types.ts`): os tipos e funções da Step 8.

- [ ] **Step 1: Remover o que sai**

```bash
cd D:/Projetos/focusbrew
git rm -r -q src-tauri/src/detector.rs src-tauri/src/focus.rs src-tauri/src/timer.rs \
  src-tauri/src/tasks.rs src-tauri/src/activity.rs src-tauri/src/platform \
  src-tauri/icons/tray/focus.png src-tauri/icons/tray/working.png src-tauri/icons/tray/coffee.png \
  src/components/Dashboard.tsx src/components/TaskBoard.tsx src/components/Settings.tsx \
  src/lib/appIcons.ts src/lib/heatmap.ts src/App.css
```

Em `src-tauri/Cargo.toml`: apagar a linha `sysinfo = "0.32"` e o bloco inteiro

```toml
[target.'cfg(windows)'.dependencies]
winreg = "0.52"
```

- [ ] **Step 2: `config.rs` — deixar só as configurações novas**

Apagar: a struct `TimerConfig` e o seu `impl Default`; os campos `monitored_processes`, `blocked_apps`, `poll_interval_secs`, `focus_auto_enable`, `block_apps_enabled`, `dnd_enabled`, `timer`, `ring_color` de `AppConfig` e da `impl Default`; e **os dois testes antigos** do módulo de testes (`settings_without_github_use_gh_keep_their_values` e `github_use_gh_defaults_to_true`, que citam campos que saíram). O teste `a_0_1_settings_file_keeps_its_values_and_gets_the_new_defaults` (Task 5) continua valendo: um JSON antigo, com campos que sumiram, tem que carregar.

`AppConfig` fica assim (conferir contra o arquivo):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// GitHub login cached after the token is validated, used to build search queries.
    pub github_login: Option<String>,
    /// Use the GitHub CLI's login (`gh auth token`) before the saved token.
    /// Turned off by "Desconectar" so gh doesn't silently reconnect.
    #[serde(default = "default_true")]
    pub github_use_gh: bool,
    pub default_minutes: u32,
    pub notify_on_finish: bool,
    pub notch_style: NotchStyle,
    pub progress_line: bool,
    pub rgb_line: bool,
    pub accent_color: String,
    pub widget_scale: WidgetScale,
    pub widget_visible: bool,
}
```

- [ ] **Step 3: `state.rs`**

Substituir tudo **antes** do `impl AppState { /// Stores a finished GitHub refresh ... }` (isto é: os `use`, o enum `Activity`, `struct AppState` e o primeiro `impl AppState { pub fn load() }`) por:

```rust
use std::collections::HashMap;

use serde::Serialize;

use crate::config::AppConfig;
use crate::github::{GithubItem, TokenSource};
use crate::tracker::tasks::{self, Task};
use crate::tracker::timer::TimerView;
use crate::tracker::{activity, now_ms, Tracker};

pub struct AppState {
    pub config: AppConfig,
    /// The tasks, the running block and the per-day log.
    pub tracker: Tracker,
    /// When the 1 s loop last ran, to notice the computer sleeping.
    pub last_tick_ms: i64,
    pub github_items: Vec<GithubItem>,
    pub github_error: Option<String>,
    /// Real GitHub contribution calendar ("YYYY-MM-DD" -> count), fetched
    /// alongside PRs/issues. Kept for stage 2 (GitHub inside the day).
    pub github_days: HashMap<String, u32>,
    /// Where the last successful GitHub token came from (gh CLI or a saved PAT).
    pub github_source: Option<TokenSource>,
}

impl AppState {
    pub fn load() -> Self {
        Self {
            config: crate::config::load(),
            tracker: Tracker::new(tasks::load(), activity::load()),
            last_tick_ms: now_ms(),
            github_items: Vec::new(),
            github_error: None,
            github_days: HashMap::new(),
            github_source: None,
        }
    }

    /// Writes the tasks and the activity log to disk.
    pub fn save_tracker(&self) {
        let _ = tasks::save(&self.tracker.tasks);
        let _ = activity::save(&self.tracker.log);
    }
}
```

Manter **intacto** o `impl AppState { apply_github_refresh, fail_github_refresh }` e o módulo `github_refresh_tests`. Trocar o bloco `StateSnapshot` + `impl From<&AppState>` por:

```rust
/// Snapshot sent to the frontend after every state change.
#[derive(Debug, Clone, Serialize)]
pub struct StateSnapshot {
    pub tasks: Vec<Task>,
    pub timer: TimerView,
    pub focus_secs_by_day: HashMap<String, u32>,
    pub config: AppConfig,
    pub github_items: Vec<GithubItem>,
    pub github_error: Option<String>,
    pub github_days: HashMap<String, u32>,
    pub github_source: Option<TokenSource>,
}

impl From<&AppState> for StateSnapshot {
    fn from(state: &AppState) -> Self {
        Self {
            tasks: state.tracker.tasks.clone(),
            timer: state.tracker.timer.view(now_ms()),
            focus_secs_by_day: state.tracker.log.focus_secs_by_day.clone(),
            config: state.config.clone(),
            github_items: state.github_items.clone(),
            github_error: state.github_error.clone(),
            github_days: state.github_days.clone(),
            github_source: state.github_source,
        }
    }
}
```

E trocar o corpo de `AppState::for_test()` (bloco `#[cfg(test)] impl AppState`) por:

```rust
    fn for_test() -> Self {
        Self {
            config: AppConfig::default(),
            tracker: Tracker::new(Vec::new(), activity::ActivityLog::default()),
            last_tick_ms: 0,
            github_items: Vec::new(),
            github_error: None,
            github_days: HashMap::new(),
            github_source: None,
        }
    }
```

- [ ] **Step 4: `widget.rs` — a janela**

Apagar do arquivo as constantes `COLLAPSED_SIZE`, `EXPANDED_SIZE`, `TOP_MARGIN`, `FALLBACK_MONITOR_WIDTH` e as funções `monitor_logical_width`, `centered_x`, `create`, `set_expanded`, `toggle_visible` (o código da Task 6 e os testes ficam). O `use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};` do topo já importa tudo que o código novo precisa. Acrescentar ao topo `use std::sync::atomic::{AtomicBool, Ordering};` e, no corpo do arquivo:

```rust
const FALLBACK_MONITOR_WIDTH: f64 = 1280.0;

/// Whether the panel is open. Set by the front-end (`set_widget_expanded`)
/// when the mouse hovers the widget; read when sizing the window.
static EXPANDED: AtomicBool = AtomicBool::new(false);

pub fn set_expanded(expanded: bool) {
    EXPANDED.store(expanded, Ordering::Relaxed);
}

pub fn is_expanded() -> bool {
    EXPANDED.load(Ordering::Relaxed)
}

/// Creates the floating widget window: transparent, always on top, no
/// decorations. Starts hidden; the first `apply` sizes, places and shows it.
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("widget").is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("index.html".into()))
        .title("focusbrew")
        .inner_size(IDLE_SIZE.0, IDLE_SIZE.1)
        .position(0.0, 0.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()?;
    Ok(())
}

/// Sizes the window and pins it to the very top of the primary monitor,
/// centered. Must run on the main thread (`sync_ui` posts it there).
pub fn apply(app: &AppHandle, layout: Layout) {
    let Some(window) = app.get_webview_window("widget") else {
        return;
    };
    if !layout.visible {
        let _ = window.hide();
        return;
    }
    let (origin_x, origin_y, width) = match window.primary_monitor() {
        Ok(Some(monitor)) => {
            let pos = monitor.position();
            logical_monitor(pos.x, pos.y, monitor.size().width, monitor.scale_factor())
        }
        _ => (0.0, 0.0, FALLBACK_MONITOR_WIDTH),
    };
    let _ = window.set_size(LogicalSize::new(layout.width, layout.height));
    let _ = window.set_position(LogicalPosition::new(
        top_center_x(origin_x, width, layout.width),
        origin_y,
    ));
    // `show` activates the window; only do it when it was hidden, or every
    // resize would steal focus from whatever the user is typing in.
    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
    }
}
```

- [ ] **Step 5: `commands.rs`**

Substituir **do início do arquivo até antes** de `#[tauri::command] pub async fn save_github_token` por:

```rust
use tauri::{AppHandle, Manager, State};

use crate::config::{self, AppConfig};
use crate::github;
use crate::state::{AppState, StateSnapshot};
use crate::tracker::tasks::{self, TaskSource};
use crate::tracker::{now_ms, today_key};
use crate::widget;
use crate::{notify_finished, sync_ui, Shared};

#[tauri::command]
pub fn get_state(shared: State<'_, Shared>) -> StateSnapshot {
    let state = shared.0.lock().unwrap();
    StateSnapshot::from(&*state)
}

/// Locks the state, runs `change`, saves tasks/log and publishes the result.
/// Every task and timer command has this shape.
fn apply<T>(
    app: &AppHandle,
    shared: &Shared,
    change: impl FnOnce(&mut AppState, i64, &str) -> T,
) -> (StateSnapshot, T) {
    let mut state = shared.0.lock().unwrap();
    let result = change(&mut state, now_ms(), &today_key());
    state.save_tracker();
    sync_ui(app, &state);
    (StateSnapshot::from(&*state), result)
}

#[tauri::command]
pub fn add_task(title: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, _, _| {
        let minutes = state.config.default_minutes;
        if let Some(task) = tasks::new_task(&title, TaskSource::Manual, minutes) {
            state.tracker.tasks.push(task);
        }
    })
    .0
}

#[tauri::command]
pub fn toggle_task(id: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, now, today| state.tracker.toggle_task(&id, now, today)).0
}

#[tauri::command]
pub fn remove_task(id: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, now, today| state.tracker.remove_task(&id, now, today)).0
}

#[tauri::command]
pub fn update_task_minutes(
    id: String,
    minutes: u32,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    let (snapshot, (finished, notify_on)) = apply(&app, &shared, |state, now, today| {
        (
            state.tracker.set_minutes(&id, minutes, now, today),
            state.config.notify_on_finish,
        )
    });
    if notify_on {
        if let Some(done) = finished {
            notify_finished(&app, &done);
        }
    }
    snapshot
}

#[tauri::command]
pub fn reorder_tasks(ids: Vec<String>, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, _, _| tasks::reorder(&mut state.tracker.tasks, &ids)).0
}

#[tauri::command]
pub fn start_task(
    id: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    let (snapshot, result) =
        apply(&app, &shared, |state, now, today| state.tracker.start_task(&id, now, today));
    result.map(|_| snapshot)
}

#[tauri::command]
pub fn toggle_pause(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, now, _| state.tracker.toggle_pause(now)).0
}

#[tauri::command]
pub fn stop_timer(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    apply(&app, &shared, |state, now, today| state.tracker.stop(now, today)).0
}

#[tauri::command]
pub fn update_settings(
    new_config: AppConfig,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    let mut state = shared.0.lock().unwrap();
    let mut config = new_config.normalized();
    // The GitHub login and the gh switch belong to the GitHub commands; a
    // settings form holding an older copy must not overwrite them.
    config.github_login = state.config.github_login.clone();
    config.github_use_gh = state.config.github_use_gh;
    state.config = config;
    let _ = config::save(&state.config);
    sync_ui(&app, &state);
    StateSnapshot::from(&*state)
}

```

Manter as funções do GitHub (`save_github_token`, `github_gh_available`, `connect_github_with_gh`, `clear_github_token`, `refresh_github`, `refresh_github_now`) sem mudança. Substituir **de `import_github_item_as_task` até o fim do arquivo** por:

```rust
#[tauri::command]
pub fn import_github_item_as_task(
    title: String,
    note: Option<String>,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> StateSnapshot {
    apply(&app, &shared, |state, _, _| {
        let minutes = state.config.default_minutes;
        if let Some(mut task) = tasks::new_task(&title, TaskSource::Github, minutes) {
            task.note = note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
            state.tracker.tasks.push(task);
        }
    })
    .0
}

#[tauri::command]
pub fn set_widget_expanded(expanded: bool, app: AppHandle, shared: State<'_, Shared>) {
    widget::set_expanded(expanded);
    let state = shared.0.lock().unwrap();
    sync_ui(&app, &state);
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) {
    crate::show_main_window(&app);
}
```

- [ ] **Step 6: `lib.rs` — reescrever o arquivo inteiro**

Conteúdo completo (a `show_main_window` e o loop do GitHub são os que já existiam):

```rust
mod commands;
mod config;
mod github;
mod state;
mod tracker;
mod widget;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{image::Image, AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

use state::{AppState, StateSnapshot};
use tracker::timer::TimerStatus;
use tracker::{now_ms, today_key, Finished};

const HOTKEY: &str = "CommandOrControl+Shift+Space";

const TRAY_ICON: &[u8] = include_bytes!("../icons/tray/idle.png");

pub struct Shared(pub Mutex<AppState>);

fn decode_icon(bytes: &[u8]) -> Image<'static> {
    let img = image::load_from_memory(bytes)
        .expect("bundled tray icons must decode")
        .into_rgba8();
    let (width, height) = img.dimensions();
    Image::new_owned(img.into_raw(), width, height)
}

/// The tray tooltip is limited (~127 chars on Windows); keep titles short.
fn short(text: &str) -> String {
    let cut: String = text.chars().take(80).collect();
    if text.chars().count() > 80 {
        format!("{cut}…")
    } else {
        cut
    }
}

fn tooltip_for(state: &AppState) -> String {
    let tracker = &state.tracker;
    let title = tracker
        .timer
        .task_id()
        .and_then(|id| tracker.tasks.iter().find(|t| t.id == id))
        .map(|t| short(&t.title));
    match (tracker.timer.status(), title) {
        (TimerStatus::Running, Some(t)) => format!("focusbrew — {t}"),
        (TimerStatus::Paused, Some(t)) => format!("focusbrew — {t} (pausado)"),
        _ => "focusbrew".to_string(),
    }
}

/// Applies the latest state to the tray tooltip and the widget window, and
/// notifies the front-end. Called after every state change.
pub fn sync_ui(app: &AppHandle, state: &AppState) {
    // Tray and window setters block until the main thread runs them, and
    // callers hold the state mutex here — while the main thread itself locks
    // that mutex (commands, tray menu, hotkey). Waiting would deadlock the UI,
    // so the update is posted to the main thread instead of awaited.
    static LAST_TOOLTIP: Mutex<String> = Mutex::new(String::new());
    let tooltip = tooltip_for(state);
    let tooltip_changed = {
        let mut last = LAST_TOOLTIP.lock().unwrap();
        let changed = *last != tooltip;
        if changed {
            *last = tooltip.clone();
        }
        changed
    };
    let layout = widget::layout_for(&state.config, state.tracker.timer.status(), widget::is_expanded());
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if tooltip_changed {
            if let Some(tray) = handle.tray_by_id("main-tray") {
                let _ = tray.set_tooltip(Some(tooltip));
            }
        }
        widget::apply(&handle, layout);
    });
    let _ = app.emit("state-changed", StateSnapshot::from(state));
}

pub(crate) fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

pub(crate) fn notify_finished(app: &AppHandle, done: &Finished) {
    notify(app, "Bloco concluído", &format!("{} · {} min", done.title, done.secs / 60));
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Ctrl+Shift+Space: pause/resume the active block, or start the first open task.
fn hotkey_action(app: &AppHandle) {
    let shared = app.state::<Shared>();
    let mut state = shared.0.lock().unwrap();
    let (now, today) = (now_ms(), today_key());
    if state.tracker.timer.status() != TimerStatus::Idle {
        state.tracker.toggle_pause(now);
    } else if let Some(id) = state.tracker.first_open_task() {
        let _ = state.tracker.start_task(&id, now, &today);
    } else {
        return;
    }
    state.save_tracker();
    sync_ui(app, &state);
}

/// Once a second: ends the block when its deadline passes and notices the
/// computer sleeping (see `Tracker::tick`).
fn spawn_tick_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let now = now_ms();
            let today = today_key();
            let mut to_notify: Option<Finished> = None;
            {
                let shared = app.state::<Shared>();
                let mut state = shared.0.lock().unwrap();
                let last = state.last_tick_ms;
                state.last_tick_ms = now;
                let before = state.tracker.timer.clone();
                let finished = state.tracker.tick(now, last, &today);
                if finished.is_some() {
                    state.save_tracker();
                    if state.config.notify_on_finish {
                        to_notify = finished.clone();
                    }
                }
                if finished.is_some() || state.tracker.timer != before {
                    sync_ui(&app, &state);
                }
            }
            if let Some(done) = to_notify {
                notify_finished(&app, &done);
            }
        }
    });
}

/// How often the PR/issue list and the heatmap refresh on their own.
const GITHUB_REFRESH_EVERY: Duration = Duration::from_secs(5 * 60);

/// Keeps the GitHub data fresh without anyone opening the GitHub tab: once
/// shortly after launch, then every few minutes while connected.
fn spawn_github_refresh_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Let the windows come up first.
        tokio::time::sleep(Duration::from_secs(3)).await;
        loop {
            let connected = {
                let shared = app.state::<Shared>();
                let state = shared.0.lock().unwrap();
                state.config.github_login.is_some()
            };
            if connected {
                // Failures land in `github_error`; nothing else to do here.
                let _ = commands::refresh_github_now(&app).await;
            }
            tokio::time::sleep(GITHUB_REFRESH_EVERY).await;
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let global_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                hotkey_action(app);
            }
        })
        .with_shortcut(HOTKEY)
        .expect("invalid global shortcut definition")
        .build();

    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(global_shortcut_plugin)
        .manage(Shared(Mutex::new(AppState::load())))
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::add_task,
            commands::toggle_task,
            commands::remove_task,
            commands::update_task_minutes,
            commands::reorder_tasks,
            commands::start_task,
            commands::toggle_pause,
            commands::stop_timer,
            commands::update_settings,
            commands::save_github_token,
            commands::github_gh_available,
            commands::connect_github_with_gh,
            commands::clear_github_token,
            commands::refresh_github,
            commands::import_github_item_as_task,
            commands::set_widget_expanded,
            commands::open_settings_window,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let menu = MenuBuilder::new(app)
                .text("open", "Abrir configurações")
                .text("toggle_widget", "Mostrar/ocultar widget")
                .text("pause", "Pausar/retomar")
                .separator()
                .text("quit", "Sair")
                .build()?;

            TrayIconBuilder::with_id("main-tray")
                .icon(decode_icon(TRAY_ICON))
                .tooltip("focusbrew")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    "toggle_widget" => {
                        let shared = app.state::<Shared>();
                        let mut state = shared.0.lock().unwrap();
                        state.config.widget_visible = !state.config.widget_visible;
                        let _ = config::save(&state.config);
                        sync_ui(app, &state);
                    }
                    "pause" => {
                        let shared = app.state::<Shared>();
                        let mut state = shared.0.lock().unwrap();
                        state.tracker.toggle_pause(now_ms());
                        sync_ui(app, &state);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            widget::create(app.handle())?;
            {
                let shared = handle.state::<Shared>();
                let state = shared.0.lock().unwrap();
                sync_ui(&handle, &state);
            }
            spawn_tick_loop(handle.clone());
            spawn_github_refresh_loop(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing a window just hides it — the app keeps living in the tray.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Keep the time of a block that is still running when the app
            // goes away ("Sair" in the tray, or the OS shutting it down).
            if let tauri::RunEvent::Exit = event {
                let shared = app_handle.state::<Shared>();
                let mut state = shared.0.lock().unwrap();
                state.tracker.stop(now_ms(), &today_key());
                state.save_tracker();
            }
        });
}
```

Em `src-tauri/src/tracker/mod.rs`, **apagar** a linha `#![allow(dead_code)] // wired up in Task 7; remove there` (agora tudo é usado; se sobrar algo sem uso, o compilador avisa e o item é removido ou usado).

- [ ] **Step 7: Compilar e testar o backend**

Run (na raiz do repositório): `grep -rn "sysinfo\|winreg" src-tauri/src`
Expected: nenhuma linha.

Run (em `src-tauri`): `cargo test 2>&1 | grep -E "^(error|warning)|test result|FAILED"`
Expected: nenhum `error` nem `warning`; `test result: ok.` com `0 failed`, somando 87 testes (tracker 53 + config 9 + github 9 + github_refresh 8 + widget 8). Se houver `warning: unused`, remover o item não usado.

- [ ] **Step 8: Front-end — tipos e IPC**

`src/lib/types.ts` (arquivo inteiro):

```ts
export type NotchStyle = "standard" | "minimal";
export type WidgetScale = "small" | "medium" | "large";

export interface AppConfig {
  github_login: string | null;
  github_use_gh: boolean;
  default_minutes: number;
  notify_on_finish: boolean;
  notch_style: NotchStyle;
  progress_line: boolean;
  rgb_line: boolean;
  accent_color: string;
  widget_scale: WidgetScale;
  widget_visible: boolean;
}

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerView {
  status: TimerStatus;
  task_id: string | null;
  planned_secs: number;
  remaining_secs: number;
  /** Epoch ms when a running block ends; 0 unless running. */
  deadline_ms: number;
}

export type TaskSource = "manual" | "github";

export interface Task {
  id: string;
  title: string;
  note: string | null;
  minutes: number;
  done: boolean;
  created_at: string;
  source: TaskSource;
  spent_secs: number;
}

export interface GithubItem {
  number: number;
  title: string;
  html_url: string;
  repository: string;
  is_pull_request: boolean;
  updated_at: string;
}

export type GithubTokenSource = "gh" | "manual";

export interface StateSnapshot {
  tasks: Task[];
  timer: TimerView;
  /** "AAAA-MM-DD" -> seconds of focus that ended on that day. */
  focus_secs_by_day: Record<string, number>;
  config: AppConfig;
  github_items: GithubItem[];
  github_error: string | null;
  github_days: Record<string, number>;
  github_source: GithubTokenSource | null;
}
```

`src/lib/tauri.ts` (arquivo inteiro):

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppConfig, StateSnapshot } from "./types";

export const currentWindowLabel = () => getCurrentWindow().label;

export const getState = () => invoke<StateSnapshot>("get_state");

export const addTask = (title: string) => invoke<StateSnapshot>("add_task", { title });
export const toggleTask = (id: string) => invoke<StateSnapshot>("toggle_task", { id });
export const removeTask = (id: string) => invoke<StateSnapshot>("remove_task", { id });
export const updateTaskMinutes = (id: string, minutes: number) =>
  invoke<StateSnapshot>("update_task_minutes", { id, minutes });
export const reorderTasks = (ids: string[]) => invoke<StateSnapshot>("reorder_tasks", { ids });

export const startTask = (id: string) => invoke<StateSnapshot>("start_task", { id });
export const toggleTimerPause = () => invoke<StateSnapshot>("toggle_pause");
export const stopTimer = () => invoke<StateSnapshot>("stop_timer");

export const updateSettings = (newConfig: AppConfig) =>
  invoke<StateSnapshot>("update_settings", { newConfig });

export const saveGithubToken = (token: string) => invoke<string>("save_github_token", { token });
export const githubGhAvailable = () => invoke<boolean>("github_gh_available");
export const connectGithubWithGh = () => invoke<string>("connect_github_with_gh");
export const clearGithubToken = () => invoke<void>("clear_github_token");
export const refreshGithub = () => invoke<StateSnapshot>("refresh_github");
export const importGithubItemAsTask = (title: string, note: string) =>
  invoke<StateSnapshot>("import_github_item_as_task", { title, note });

export const setWidgetExpanded = (expanded: boolean) =>
  invoke<void>("set_widget_expanded", { expanded });
export const openSettingsWindow = () => invoke<void>("open_settings_window");

export const onStateChanged = (cb: (snapshot: StateSnapshot) => void) =>
  listen<StateSnapshot>("state-changed", (event) => cb(event.payload));
```

- [ ] **Step 9: Front-end — as duas telas provisórias e o `GithubPanel`**

`src/App.tsx` (arquivo inteiro; provisório até a Task 11 — sem CSS por enquanto, o `GithubPanel` aparece sem estilo):

```tsx
import { useEffect, useState } from "react";
import type { StateSnapshot } from "./lib/types";
import { getState, onStateChanged } from "./lib/tauri";
import GithubPanel from "./components/GithubPanel";

export default function App() {
  const [state, setState] = useState<StateSnapshot | null>(null);

  useEffect(() => {
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) {
    return (
      <main className="container loading">
        <p>Carregando...</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>focusbrew</h1>
      <GithubPanel state={state} />
    </main>
  );
}
```

`src/Widget.tsx` (arquivo inteiro; provisório até a Task 9):

```tsx
import { useEffect, useState } from "react";
import type { StateSnapshot } from "./lib/types";
import { getState, onStateChanged } from "./lib/tauri";

export default function Widget() {
  const [state, setState] = useState<StateSnapshot | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) return null;
  return <div style={{ background: "#000", color: "#f2f2f3", font: "11px sans-serif" }}>{state.timer.status}</div>;
}
```

Em `src/components/GithubPanel.tsx`, na função `GithubRow`, trocar a chamada do botão **+ Tarefa**:

```tsx
        <button onClick={() => importGithubItemAsTask(item.title, `${item.repository} #${item.number}`)}>
          + Tarefa
        </button>
```

(antes era `importGithubItemAsTask(\`${item.repository} #${item.number} — ${item.title}\`)`).

- [ ] **Step 10: Verificar tudo e commitar**

Run: `npx tsc --noEmit && echo tsc-ok` — Expected: `tsc-ok`.
Run: `cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"` — Expected: `0 failed`.
Run: `npm run build 2>&1 | tail -3` — Expected: build do Vite sem erro.

```bash
git add -A src-tauri src
git commit -m "feat: tracker-driven backend; remove the focus mode, app blocking and DND" -m "Tasks with their own timer, the widget sized per state and pinned to the top of the monitor, a 1 s deadline loop, a single tray icon. Temporary screens until the new UI lands." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `vitest` e as contas puras do front-end

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Create: `src/lib/progress.ts`, `src/lib/progress.test.ts`, `src/lib/activity.ts`, `src/lib/activity.test.ts`, `src/lib/reorder.ts`, `src/lib/reorder.test.ts`, `src/lib/scale.ts`, `src/lib/scale.test.ts`

**Interfaces:**
- Consumes: `TimerView`, `WidgetScale` de `src/lib/types.ts`.
- Produces:
  - `progress.ts`: `progressFraction(timer: TimerView, nowMs: number): number` (0..1), `remainingSecs(timer: TimerView, nowMs: number): number`, `formatClock(secs: number): string`, `interface UShape { width; height; radius; inset }`, `uPath(shape: UShape): string`, `uLength(shape: UShape): number`
  - `activity.ts`: `WEEKS = 4`, `interface DayCell { date: string; secs: number; level: 0|1|2|3|4 }`, `level(secs): 0|1|2|3|4`, `dateKey(d: Date): string`, `mondayOf(d: Date): Date`, `buildGrid(secsByDay: Record<string, number>, today: Date): (DayCell | null)[]` (28 posições, segunda primeiro, `null` = dia futuro), `formatDuration(secs: number): string`, `cellTitle(cell: DayCell): string`
  - `reorder.ts`: `moveItem<T>(items: T[], from: number, to: number): T[]`, `dropIndex(midpoints: number[], y: number, from: number): number`
  - `scale.ts`: `SCALE_FACTOR: Record<WidgetScale, number>`

- [ ] **Step 1: Instalar o `vitest` e criar o script**

```bash
cd D:/Projetos/focusbrew
npm install -D vitest
npm pkg set scripts.test="vitest run"
npm ls vite vitest 2>&1 | head -8
```

Expected: `vitest` instalado sem erro de peer dependency. Se o `npm` reclamar que a versão do `vitest` não aceita o `vite` instalado (o projeto usa `vite ^8`), rodar `npm view vitest versions --json | tail -5` e instalar a mais recente que aceite o `vite` do projeto (`npm install -D vitest@<versão>`); **não** rebaixar o `vite`.

- [ ] **Step 2: Escrever os testes que falham**

`src/lib/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TimerView } from "./types";
import { formatClock, progressFraction, remainingSecs, uLength, uPath } from "./progress";

const NOW = 1_000_000;

const running = (planned: number, deadlineMs: number): TimerView => ({
  status: "running",
  task_id: "a",
  planned_secs: planned,
  remaining_secs: 0,
  deadline_ms: deadlineMs,
});

const paused = (planned: number, remaining: number): TimerView => ({
  status: "paused",
  task_id: "a",
  planned_secs: planned,
  remaining_secs: remaining,
  deadline_ms: 0,
});

const idle: TimerView = { status: "idle", task_id: null, planned_secs: 0, remaining_secs: 0, deadline_ms: 0 };

describe("progressFraction", () => {
  it("is 0 when idle", () => {
    expect(progressFraction(idle, NOW)).toBe(0);
  });

  it("is 0 at the start, 0.5 in the middle and 1 at the deadline", () => {
    expect(progressFraction(running(1500, NOW + 1_500_000), NOW)).toBe(0);
    expect(progressFraction(running(1500, NOW + 750_000), NOW)).toBe(0.5);
    expect(progressFraction(running(1500, NOW), NOW)).toBe(1);
  });

  it("stays between 0 and 1 even if the clock jumps", () => {
    expect(progressFraction(running(1500, NOW + 9_000_000), NOW)).toBe(0); // clock went back
    expect(progressFraction(running(1500, NOW - 5_000), NOW)).toBe(1); // already past
  });

  it("uses the frozen remaining time while paused", () => {
    expect(progressFraction(paused(100, 25), NOW)).toBe(0.75);
    expect(progressFraction(paused(100, 25), NOW + 99_999_999)).toBe(0.75);
  });

  it("never divides by zero", () => {
    expect(progressFraction(paused(0, 0), NOW)).toBe(0);
  });
});

describe("remainingSecs", () => {
  it("rounds up while running, like the backend", () => {
    const t = running(300, NOW + 299_001);
    expect(remainingSecs(t, NOW)).toBe(300);
    expect(remainingSecs(t, NOW + 1_001)).toBe(299);
  });

  it("is never more than planned or below zero", () => {
    expect(remainingSecs(running(300, NOW + 9_000_000), NOW)).toBe(300);
    expect(remainingSecs(running(300, NOW - 1), NOW)).toBe(0);
  });

  it("returns the frozen value when paused and 0 when idle", () => {
    expect(remainingSecs(paused(300, 77), NOW)).toBe(77);
    expect(remainingSecs(idle, NOW)).toBe(0);
  });
});

describe("formatClock", () => {
  it("writes mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(1673)).toBe("27:53");
    expect(formatClock(59.9)).toBe("00:59");
  });

  it("keeps counting minutes past 99 and clamps negatives", () => {
    expect(formatClock(10800)).toBe("180:00");
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("the U-shaped progress line", () => {
  const shape = { width: 320, height: 44, radius: 14, inset: 1 };

  it("goes down the left side, along the bottom and up the right side", () => {
    expect(uPath(shape)).toBe(
      "M 1 0 L 1 29 A 14 14 0 0 0 15 43 L 305 43 A 14 14 0 0 0 319 29 L 319 0",
    );
  });

  it("measures two sides, the bottom and two quarter circles", () => {
    expect(uLength(shape)).toBeCloseTo(2 * 29 + 290 + Math.PI * 14, 5);
  });

  it("shrinks the radius for a box that is too small instead of breaking", () => {
    const tiny = { width: 20, height: 10, radius: 14, inset: 1 };
    expect(uPath(tiny)).not.toContain("NaN");
    const length = uLength(tiny);
    expect(Number.isFinite(length)).toBe(true);
    expect(length).toBeGreaterThanOrEqual(0);
  });
});
```

`src/lib/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGrid, cellTitle, dateKey, formatDuration, level, mondayOf } from "./activity";

describe("level", () => {
  it("maps seconds to the five tones", () => {
    expect(level(0)).toBe(0);
    expect(level(-10)).toBe(0);
    expect(level(1)).toBe(1);
    expect(level(14 * 60 + 59)).toBe(1);
    expect(level(15 * 60)).toBe(2);
    expect(level(44 * 60 + 59)).toBe(2);
    expect(level(45 * 60)).toBe(3);
    expect(level(89 * 60 + 59)).toBe(3);
    expect(level(90 * 60)).toBe(4);
    expect(level(10 * 3600)).toBe(4);
  });
});

describe("dates", () => {
  it("writes the local date as AAAA-MM-DD", () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("finds the Monday of any weekday, including Sunday", () => {
    expect(dateKey(mondayOf(new Date(2026, 9, 5)))).toBe("2026-10-05"); // Monday
    expect(dateKey(mondayOf(new Date(2026, 9, 7)))).toBe("2026-10-05"); // Wednesday
    expect(dateKey(mondayOf(new Date(2026, 9, 11)))).toBe("2026-10-05"); // Sunday
  });
});

describe("buildGrid", () => {
  it("has 4 weeks of 7 days, Monday first, ending in the current week", () => {
    const grid = buildGrid({}, new Date(2026, 9, 5)); // a Monday
    expect(grid).toHaveLength(28);
    expect(grid[0]?.date).toBe("2026-09-14");
    expect(grid[21]?.date).toBe("2026-10-05");
  });

  it("leaves the days after today empty", () => {
    const grid = buildGrid({}, new Date(2026, 9, 5)); // Monday: the rest of the week is the future
    expect(grid.slice(22)).toEqual([null, null, null, null, null, null]);

    const wednesday = buildGrid({}, new Date(2026, 9, 7));
    expect(wednesday[23]?.date).toBe("2026-10-07");
    expect(wednesday.slice(24)).toEqual([null, null, null, null]);
  });

  it("fills the whole last row on a Sunday", () => {
    const grid = buildGrid({}, new Date(2026, 9, 11));
    expect(grid.slice(21).every((cell) => cell !== null)).toBe(true);
    expect(grid[27]?.date).toBe("2026-10-11");
  });

  it("crosses a month boundary correctly", () => {
    const grid = buildGrid({}, new Date(2026, 2, 1)); // Sunday, 1 March 2026
    expect(grid[0]?.date).toBe("2026-02-02");
    expect(grid[27]?.date).toBe("2026-03-01");
  });

  it("applies the seconds of each day and their tone", () => {
    const grid = buildGrid({ "2026-10-05": 50 * 60, "2026-09-14": 60 }, new Date(2026, 9, 5));
    expect(grid[21]).toEqual({ date: "2026-10-05", secs: 3000, level: 3 });
    expect(grid[0]).toEqual({ date: "2026-09-14", secs: 60, level: 1 });
    expect(grid[1]?.level).toBe(0);
  });
});

describe("durations", () => {
  it("writes minutes, hours and both", () => {
    expect(formatDuration(0)).toBe("0min");
    expect(formatDuration(2700)).toBe("45min");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(5100)).toBe("1h 25min");
  });

  it("builds the tooltip as dd/mm — duration", () => {
    expect(cellTitle({ date: "2026-10-05", secs: 5100, level: 3 })).toBe("05/10 — 1h 25min");
  });
});
```

`src/lib/reorder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dropIndex, moveItem } from "./reorder";

describe("moveItem", () => {
  it("moves down and up", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("returns a copy and changes nothing when from equals to or is out of range", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(items, 1, 1)).not.toBe(items);
    expect(moveItem(items, 5, 0)).toEqual(["a", "b"]);
    expect(moveItem(items, -1, 0)).toEqual(["a", "b"]);
  });

  it("clamps the target to the ends", () => {
    expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
  });
});

describe("dropIndex", () => {
  const mids = [10, 30, 50];

  it("counts the other rows whose middle is above the pointer", () => {
    expect(dropIndex(mids, 40, 0)).toBe(1); // row 0 dragged between rows 1 and 2
    expect(dropIndex(mids, 20, 2)).toBe(1); // row 2 dragged between rows 0 and 1
  });

  it("goes to the ends when the pointer is above or below everything", () => {
    expect(dropIndex(mids, 0, 1)).toBe(0);
    expect(dropIndex(mids, 100, 0)).toBe(2);
  });

  it("agrees with moveItem: dragging row 0 down past row 1 gives [b, a, c]", () => {
    const to = dropIndex(mids, 40, 0);
    expect(moveItem(["a", "b", "c"], 0, to)).toEqual(["b", "a", "c"]);
  });
});
```

`src/lib/scale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SCALE_FACTOR } from "./scale";

describe("SCALE_FACTOR", () => {
  // Must match `WidgetScale::factor` in src-tauri/src/config.rs.
  it("is 0.85 / 1 / 1.25", () => {
    expect(SCALE_FACTOR).toEqual({ small: 0.85, medium: 1, large: 1.25 });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test 2>&1 | tail -15`
Expected: falha por não achar `./progress`, `./activity`, `./reorder`, `./scale`.

- [ ] **Step 4: Implementar**

`src/lib/progress.ts`:

```ts
import type { TimerView } from "./types";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Fraction of the block already worked (0..1), from the deadline and the
 * wall clock. The front-end never counts time: the backend sends `deadline_ms`
 * (running) or `remaining_secs` (paused) and this does the arithmetic.
 */
export function progressFraction(timer: TimerView, nowMs: number): number {
  if (timer.status === "idle" || timer.planned_secs <= 0) return 0;
  const remainingMs =
    timer.status === "running" ? timer.deadline_ms - nowMs : timer.remaining_secs * 1000;
  return clamp01(1 - remainingMs / (timer.planned_secs * 1000));
}

/** Whole seconds left, rounded up like the backend does. */
export function remainingSecs(timer: TimerView, nowMs: number): number {
  if (timer.status === "idle") return 0;
  if (timer.status === "paused") return timer.remaining_secs;
  const left = Math.max(0, Math.ceil((timer.deadline_ms - nowMs) / 1000));
  return Math.min(left, timer.planned_secs);
}

/** "mm:ss" ("27:53"); minutes keep growing past 99 ("180:00"). */
export function formatClock(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** The "U" the progress line follows: down the left, along the bottom, up the right. */
export interface UShape {
  width: number;
  height: number;
  radius: number;
  /** Half the stroke width, so the line stays inside the box. */
  inset: number;
}

/** A radius that fits the box, so a tiny box never produces a broken path. */
function safeRadius({ width, height, radius, inset }: UShape): number {
  return Math.max(0, Math.min(radius, height - inset, (width - 2 * inset) / 2));
}

export function uPath(shape: UShape): string {
  const { width, height, inset } = shape;
  const r = safeRadius(shape);
  const x0 = inset;
  const x1 = width - inset;
  const yb = height - inset;
  return `M ${x0} 0 L ${x0} ${yb - r} A ${r} ${r} 0 0 0 ${x0 + r} ${yb} L ${x1 - r} ${yb} A ${r} ${r} 0 0 0 ${x1} ${yb - r} L ${x1} 0`;
}

export function uLength(shape: UShape): number {
  const { width, height, inset } = shape;
  const r = safeRadius(shape);
  const side = height - inset - r;
  const bottom = width - 2 * inset - 2 * r;
  return 2 * side + bottom + Math.PI * r;
}
```

`src/lib/activity.ts`:

```ts
export const WEEKS = 4;

export type Level = 0 | 1 | 2 | 3 | 4;

export interface DayCell {
  /** "AAAA-MM-DD", local date. */
  date: string;
  secs: number;
  level: Level;
}

/** Tone of a day by seconds of focus: 0, <15 min, <45 min, <90 min, 90+ min. */
export function level(secs: number): Level {
  if (secs <= 0) return 0;
  if (secs < 15 * 60) return 1;
  if (secs < 45 * 60) return 2;
  if (secs < 90 * 60) return 3;
  return 4;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the week that contains `d` (local time, at midnight). */
export function mondayOf(d: Date): Date {
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
}

/**
 * 4 weeks x 7 days, row by row (Monday first); the last row is the current
 * week. Days after `today` are `null` (nothing is drawn for the future).
 */
export function buildGrid(secsByDay: Record<string, number>, today: Date): (DayCell | null)[] {
  const first = mondayOf(today);
  first.setDate(first.getDate() - 7 * (WEEKS - 1));
  const todayKey = dateKey(today);
  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const key = dateKey(day);
    if (key > todayKey) {
      cells.push(null); // ISO dates compare correctly as text
      continue;
    }
    const secs = secsByDay[key] ?? 0;
    cells.push({ date: key, secs, level: level(secs) });
  }
  return cells;
}

/** "1h 25min", "45min", "1h", "0min". */
export function formatDuration(secs: number): string {
  const totalMinutes = Math.round(secs / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

/** Tooltip of a square: "05/10 — 1h 25min". */
export function cellTitle(cell: DayCell): string {
  const [, month, day] = cell.date.split("-");
  return `${day}/${month} — ${formatDuration(cell.secs)}`;
}
```

`src/lib/reorder.ts`:

```ts
/** A copy of `items` with the element at `from` moved to index `to` (clamped). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  if (from === to || from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/**
 * Where a dragged row lands: the number of the *other* rows whose middle is
 * above the pointer. `midpoints` are the rows' vertical middles in order,
 * `from` is the dragged row's index (excluded from the count).
 */
export function dropIndex(midpoints: number[], y: number, from: number): number {
  return midpoints.reduce((count, mid, i) => (i !== from && mid < y ? count + 1 : count), 0);
}
```

`src/lib/scale.ts`:

```ts
import type { WidgetScale } from "./types";

/** Must match `WidgetScale::factor` in src-tauri/src/config.rs. */
export const SCALE_FACTOR: Record<WidgetScale, number> = {
  small: 0.85,
  medium: 1,
  large: 1.25,
};
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test 2>&1 | tail -12` — Expected: `Test Files  4 passed` e todos os testes verdes.
Run: `npx tsc --noEmit && echo tsc-ok` — Expected: `tsc-ok`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib
git commit -m "feat: pure front-end helpers (progress line, activity grid, reorder, scale) with vitest" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: O widget — barra parada, caixa rodando, linha de progresso, abrir com o mouse

**Files:**
- Create: `src/widget/hooks.ts`, `src/widget/icons.tsx`, `src/widget/ProgressLine.tsx`, `src/widget/Notch.tsx`, `src/widget/TodoPanel.tsx` (provisório; a Task 10 completa)
- Modify: `src/Widget.tsx` (reescrever), `src/Widget.css` (reescrever)
- Create (fora do repositório, só pra conferir a tela): `%LOCALAPPDATA%\Temp\fb-shots\{harness.ts,widget.shoot.ts}`

**Interfaces:**
- Consumes: `progress.ts` (`progressFraction`, `remainingSecs`, `formatClock`, `uPath`, `uLength`), `scale.ts` (`SCALE_FACTOR`), `tauri.ts` (`getState`, `onStateChanged`, `setWidgetExpanded`), tipos.
- Produces:
  - `hooks.ts`: `useNow(active: boolean): number` (relógio atualizado a cada 250 ms enquanto `active`), `useElementSize(ref): { width: number; height: number }`, `useHoverOpen(onChange: (open: boolean) => void, openDelay = 250, closeDelay = 400): { open: boolean; onMouseEnter: () => void; onMouseLeave: () => void; setHolding: (v: boolean) => void }`
  - `ProgressLine`: props `{ timer: TimerView; now: number; rgb: boolean; visible: boolean }`
  - `Notch`: props `{ state: StateSnapshot; now: number }`
  - `TodoPanel`: props `{ state: StateSnapshot; now: number; onHold: (hold: boolean) => void }`
  - `icons.tsx`: `ClockIcon`, `PlayIcon`, `PauseIcon`, `GripIcon`, `BarsIcon`, `CheckIcon`

**Como a escala funciona no CSS:** todo o CSS do widget é escrito em pixels do tamanho Médio. O container interno (`.scaled`) tem `width: calc(100vw / var(--s))`, `height: calc(100vh / var(--s))` e `transform: scale(var(--s))`, então ele preenche exatamente a janela que o backend dimensionou (`base × escala`) e tudo — texto, linha, raio — escala junto.

- [ ] **Step 1: Os hooks**

`src/widget/hooks.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * Current time in ms, refreshed every 250 ms while `active`. The progress
 * line moves well under 1 px per second and the countdown changes once a
 * second, so 4 updates a second is smooth and costs almost no CPU.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** The element's layout size, kept up to date with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * Opens after the mouse rests on the widget for `openDelay` ms and closes
 * `closeDelay` ms after it leaves — unless something holds it open (the "Add a
 * task" field has focus, or a row is being dragged).
 */
export function useHoverOpen(
  onChange: (open: boolean) => void,
  openDelay = 250,
  closeDelay = 400,
) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const inside = useRef(false);
  const holding = useRef(false);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const apply = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
    onChange(next);
  };

  const schedule = () => {
    clear();
    if (inside.current && !openRef.current) {
      timer.current = window.setTimeout(() => apply(true), openDelay);
    } else if (!inside.current && openRef.current && !holding.current) {
      timer.current = window.setTimeout(() => {
        if (!inside.current && !holding.current) apply(false);
      }, closeDelay);
    }
  };

  useEffect(() => clear, []);

  return {
    open,
    onMouseEnter: () => {
      inside.current = true;
      schedule();
    },
    onMouseLeave: () => {
      inside.current = false;
      schedule();
    },
    setHolding: (value: boolean) => {
      holding.current = value;
      schedule();
    },
  };
}
```

- [ ] **Step 2: Os ícones**

`src/widget/icons.tsx`:

```tsx
interface IconProps {
  size?: number;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const ClockIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.6V8l2.3 1.5" />
  </svg>
);

export const PlayIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" />
  </svg>
);

export const PauseIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <rect x="3.6" y="2.8" width="3.2" height="10.4" rx="1" />
    <rect x="9.2" y="2.8" width="3.2" height="10.4" rx="1" />
  </svg>
);

export const GripIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    {[4, 8, 12].flatMap((y) => [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" />))}
  </svg>
);

export const BarsIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <rect x="2" y="8" width="3.4" height="6" rx="0.8" />
    <rect x="6.3" y="3" width="3.4" height="11" rx="0.8" />
    <rect x="10.6" y="6" width="3.4" height="8" rx="0.8" />
  </svg>
);

export const CheckIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth={2}>
    <path d="M3.5 8.5l3 3 6-6.5" />
  </svg>
);
```

- [ ] **Step 3: A linha de progresso**

`src/widget/ProgressLine.tsx`:

```tsx
import { useRef } from "react";
import type { TimerView } from "../lib/types";
import { progressFraction, uLength, uPath } from "../lib/progress";
import { useElementSize } from "./hooks";

interface Props {
  timer: TimerView;
  now: number;
  /** Rainbow instead of the accent color. */
  rgb: boolean;
  /** False hides it (the "Progress timeline" switch, or no block running). */
  visible: boolean;
}

const STROKE = 2;
const RADIUS = 14;
const RAINBOW = ["#ff2d55", "#ff9f0a", "#ffd60a", "#30d158", "#0a84ff", "#bf5af2", "#ff2d55"];

/**
 * A thin line that follows the box's left, bottom and right edges (never the
 * top) and fills as the block runs. Sized by measuring its parent, so it fits
 * the notch box and the open panel alike.
 */
export default function ProgressLine({ timer, now, rgb, visible }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);

  if (!visible) return <div ref={ref} className="progress-line" />;

  const shape = { width, height, radius: RADIUS, inset: STROKE / 2 };
  const ready = width > 0 && height > 0;
  const length = ready ? uLength(shape) : 0;
  const path = ready ? uPath(shape) : "";
  const fraction = progressFraction(timer, now);

  return (
    <div ref={ref} className="progress-line">
      {ready && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {rgb && (
            <defs>
              <linearGradient id="rgb-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
                {RAINBOW.map((color, i) => (
                  <stop key={i} offset={i / (RAINBOW.length - 1)} stopColor={color} />
                ))}
              </linearGradient>
            </defs>
          )}
          <path d={path} className="progress-track" strokeWidth={STROKE} fill="none" />
          <path
            d={path}
            className={rgb ? "progress-fill rgb" : "progress-fill"}
            stroke={rgb ? "url(#rgb-line)" : undefined}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - fraction)}
          />
        </svg>
      )}
    </div>
  );
}
```

- [ ] **Step 4: A barra parada e a caixa rodando**

`src/widget/Notch.tsx`:

```tsx
import type { StateSnapshot } from "../lib/types";
import { formatClock, remainingSecs } from "../lib/progress";
import { ClockIcon } from "./icons";
import ProgressLine from "./ProgressLine";

interface Props {
  state: StateSnapshot;
  now: number;
}

/**
 * Parked: a flat black bar at the very top of the screen, nothing inside.
 * Running or paused: a black box with rounded bottom corners and the progress
 * line around it. Standard shows the countdown and the task; Minimal only the box.
 */
export default function Notch({ state, now }: Props) {
  const { timer, config, tasks } = state;
  if (timer.status === "idle") return <div className="notch-idle" />;

  const task = tasks.find((t) => t.id === timer.task_id);
  return (
    <div className={`notch-box ${timer.status}`}>
      {config.notch_style === "standard" && (
        <>
          <span className="notch-clock">
            <ClockIcon />
            <span className="notch-time">{formatClock(remainingSecs(timer, now))}</span>
          </span>
          <span className="notch-title">{task?.title ?? ""}</span>
        </>
      )}
      <ProgressLine timer={timer} now={now} rgb={config.rgb_line} visible={config.progress_line} />
    </div>
  );
}
```

- [ ] **Step 5: O painel provisório**

`src/widget/TodoPanel.tsx` (provisório; a Task 10 troca o miolo):

```tsx
import type { StateSnapshot } from "../lib/types";
import ProgressLine from "./ProgressLine";

interface Props {
  state: StateSnapshot;
  now: number;
  onHold: (hold: boolean) => void;
}

export default function TodoPanel({ state, now }: Props) {
  const { timer, config } = state;
  return (
    <div className="panel">
      <ProgressLine
        timer={timer}
        now={now}
        rgb={config.rgb_line}
        visible={config.progress_line && timer.status !== "idle"}
      />
    </div>
  );
}
```

- [ ] **Step 6: A janela do widget**

`src/Widget.tsx` (arquivo inteiro):

```tsx
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { StateSnapshot } from "./lib/types";
import { getState, onStateChanged, setWidgetExpanded } from "./lib/tauri";
import { SCALE_FACTOR } from "./lib/scale";
import Notch from "./widget/Notch";
import TodoPanel from "./widget/TodoPanel";
import { useHoverOpen, useNow } from "./widget/hooks";
import "./Widget.css";

export default function Widget() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const hover = useHoverOpen((open) => {
    void setWidgetExpanded(open);
  });
  const now = useNow(state?.timer.status === "running");

  useEffect(() => {
    // Inline and in this window only (the settings window shares the bundle):
    // a transparent, margin-less, non-scrolling page behind the notch.
    for (const el of [document.documentElement, document.body, document.getElementById("root")]) {
      if (!el) continue;
      el.style.background = "transparent";
      el.style.margin = "0";
      el.style.padding = "0";
      el.style.overflow = "hidden";
    }
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) return null;

  const style = {
    "--accent": state.config.accent_color,
    "--s": SCALE_FACTOR[state.config.widget_scale],
  } as CSSProperties;

  return (
    <div
      className="widget-root"
      style={style}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <div className="scaled">
        {hover.open ? (
          <TodoPanel state={state} now={now} onHold={hover.setHolding} />
        ) : (
          <Notch state={state} now={now} />
        )}
      </div>
    </div>
  );
}
```

`src/Widget.css` (arquivo inteiro — substitui o CSS antigo; a Task 10 acrescenta o do painel):

```css
/* Everything is scoped under .widget-root: both windows load the same bundle,
   so nothing here may style html/body or the settings window would inherit it. */
.widget-root {
  --accent: #0a84ff;
  --s: 1;
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  color: #f2f2f3;
  user-select: none;
  -webkit-user-select: none;
}

/* Everything inside is written in Medium pixels; the backend sizes the window
   to base * scale, and this fills it exactly while scaling the content. */
.scaled {
  width: calc(100vw / var(--s));
  height: calc(100vh / var(--s));
  transform: scale(var(--s));
  transform-origin: 0 0;
  position: relative;
}

/* ---- parked: a flat bar at the very top, nothing inside ---- */
.notch-idle {
  height: 6px;
  background: #000;
}

/* ---- running / paused ---- */
.notch-box {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background: #000;
  border-radius: 0 0 14px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 22px;
  font-size: 13px;
}

.notch-clock {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.notch-box.paused .notch-time {
  animation: pulse 1.6s ease-in-out infinite;
}

.notch-title {
  min-width: 0;
  max-width: 58%;
  color: #8a8a90;
  font-size: 12px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}

/* ---- the progress line ---- */
.progress-line {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.progress-line svg {
  display: block;
}

.progress-track {
  stroke: color-mix(in srgb, var(--accent) 28%, transparent);
}

.progress-fill {
  stroke: var(--accent);
}

.progress-fill.rgb {
  animation: rgb-spin 4s linear infinite;
}

@keyframes rgb-spin {
  from {
    filter: hue-rotate(0deg) drop-shadow(0 0 6px rgba(255, 255, 255, 0.4));
  }
  to {
    filter: hue-rotate(360deg) drop-shadow(0 0 6px rgba(255, 255, 255, 0.4));
  }
}

/* ---- the open panel (frame only; the content is styled in Task 10) ---- */
.panel {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background: #0b0b0d;
  border: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
  border-top: none;
  border-radius: 0 0 18px 18px;
}
```

- [ ] **Step 7: Conferir os tipos e os testes**

Run: `npx tsc --noEmit && echo tsc-ok && npm test 2>&1 | tail -4`
Expected: `tsc-ok` e todos os testes passando.

- [ ] **Step 8: Conferir a tela com um backend de mentira (fora do repositório)**

Esta pasta e os arquivos ficam em `%LOCALAPPDATA%\Temp\fb-shots` — **não** entram no repositório. O mesmo `harness.ts` é reaproveitado nas Tasks 10 e 11.

```bash
mkdir -p "$LOCALAPPDATA/Temp/fb-shots" && cd "$LOCALAPPDATA/Temp/fb-shots" && bun init -y >/dev/null 2>&1; bun add playwright-core
```

`harness.ts`:

```ts
// A fake Tauri backend that runs in the page: same commands, same snapshot
// shape, pushes `state-changed` after each change and records every call.
export function demoState(over: Record<string, unknown> = {}) {
  const day = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const focus: Record<string, number> = {};
  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 28; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const r = rnd();
    if (r > 0.25) focus[day(d)] = Math.floor(r * 4 * 3600);
  }
  const task = (id: string, title: string, minutes: number, extra: Record<string, unknown> = {}) => ({
    id, title, note: null, minutes, done: false, created_at: "", source: "manual", spent_secs: 0, ...extra,
  });
  return {
    tasks: [
      task("1", "Escrever o relatório trimestral", 45, { note: "Números e próximos passos" }),
      task("2", "Revisar pull requests", 25),
      task("3", "Atualizar o README", 30),
      task("4", "Responder e-mails", 15, { done: true }),
    ],
    timer: { status: "idle", task_id: null, planned_secs: 0, remaining_secs: 0, deadline_ms: 0 },
    focus_secs_by_day: focus,
    config: {
      github_login: null, github_use_gh: true, default_minutes: 25, notify_on_finish: true,
      notch_style: "standard", progress_line: true, rgb_line: false, accent_color: "#0A84FF",
      widget_scale: "medium", widget_visible: true,
    },
    github_items: [], github_error: null, github_days: {}, github_source: null,
    ...over,
  };
}

export function mockScript(label: string, state: unknown) {
  return `(() => {
    const state = ${JSON.stringify(state)};
    const calls = []; window.__calls = calls;
    let cb = 0; const listeners = [];
    const idle = () => ({ status: "idle", task_id: null, planned_secs: 0, remaining_secs: 0, deadline_ms: 0 });
    const clamp = (m) => Math.max(5, Math.min(180, m));
    const find = (id) => state.tasks.find((t) => t.id === id);
    const emit = () => listeners.forEach((id) => window["_" + id]({ event: "state-changed", id: 0, payload: JSON.parse(JSON.stringify(state)) }));
    const handlers = {
      get_state: () => {},
      add_task: ({ title }) => { const t = String(title).trim(); if (t) state.tasks.push({ id: "n" + Date.now() + Math.random(), title: t.slice(0, 200), note: null, minutes: state.config.default_minutes, done: false, created_at: "", source: "manual", spent_secs: 0 }); },
      toggle_task: ({ id }) => { const t = find(id); if (t) { t.done = !t.done; if (t.done && state.timer.task_id === id) state.timer = idle(); } },
      remove_task: ({ id }) => { if (state.timer.task_id === id) state.timer = idle(); state.tasks = state.tasks.filter((t) => t.id !== id); },
      update_task_minutes: ({ id, minutes }) => { const t = find(id); if (t) t.minutes = clamp(minutes); },
      reorder_tasks: ({ ids }) => { const listed = ids.map(find).filter(Boolean); state.tasks = [...listed, ...state.tasks.filter((t) => !ids.includes(t.id))]; },
      start_task: ({ id }) => { const t = find(id); if (t && !t.done) state.timer = { status: "running", task_id: id, planned_secs: t.minutes * 60, remaining_secs: t.minutes * 60, deadline_ms: Date.now() + t.minutes * 60000 }; },
      toggle_pause: () => { const m = state.timer; if (m.status === "running") { m.remaining_secs = Math.ceil((m.deadline_ms - Date.now()) / 1000); m.status = "paused"; m.deadline_ms = 0; } else if (m.status === "paused") { m.deadline_ms = Date.now() + m.remaining_secs * 1000; m.status = "running"; } },
      stop_timer: () => { state.timer = idle(); },
      update_settings: ({ newConfig }) => { state.config = { ...state.config, ...newConfig }; },
      set_widget_expanded: () => {},
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: ${JSON.stringify(label)} }, currentWebview: { windowLabel: ${JSON.stringify(label)}, label: ${JSON.stringify(label)} } },
      transformCallback(fn) { const id = ++cb; window["_" + id] = fn; return id; },
      unregisterCallback() {}, convertFileSrc: (p) => p,
      invoke(cmd, args) {
        if (cmd === "plugin:event|listen") { listeners.push(args.handler); return Promise.resolve(listeners.length); }
        if (cmd.startsWith("plugin:event|")) return Promise.resolve(null);
        calls.push([cmd, args]);
        const h = handlers[cmd];
        if (h) { h(args || {}); if (cmd !== "get_state") emit(); }
        return Promise.resolve(JSON.parse(JSON.stringify(state)));
      },
    };
  })();`;
}
```

`widget.shoot.ts` (rodar com o Vite do projeto no ar: em outro terminal, `npx vite --port 1420 --strictPort` dentro de `D:/Projetos/focusbrew`):

```ts
import { chromium } from "playwright-core";
import { demoState, mockScript } from "./harness";

const OUT = process.argv[2] ?? ".";
const browser = await chromium.launch({ channel: "chrome" });

async function open(w: number, h: number, state: unknown) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
  await ctx.addInitScript(mockScript("widget", state));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(400);
  return page;
}
const running = (planned: number, elapsed: number, over: Record<string, unknown> = {}) => ({
  status: "running", task_id: "1", planned_secs: planned,
  remaining_secs: 0, deadline_ms: Date.now() + (planned - elapsed) * 1000, ...over,
});

// 1. parked: a flat 6 px bar
let p = await open(140, 14, demoState());
await p.screenshot({ path: `${OUT}/1-parado.png`, omitBackground: true });
console.log("parked bar height:", await p.locator(".notch-idle").evaluate((e) => e.getBoundingClientRect().height));

// 2. running, standard, 40 % done
p = await open(320, 44, demoState({ timer: running(1500, 600) }));
await p.screenshot({ path: `${OUT}/2-rodando-standard.png`, omitBackground: true });

// 3. running, minimal
p = await open(320, 44, demoState({ timer: running(1500, 900), config: { ...demoState().config, notch_style: "minimal" } }));
await p.screenshot({ path: `${OUT}/3-rodando-minimal.png`, omitBackground: true });

// 4. paused
p = await open(320, 44, demoState({ timer: { status: "paused", task_id: "1", planned_secs: 1500, remaining_secs: 1000, deadline_ms: 0 } }));
await p.screenshot({ path: `${OUT}/4-pausado.png`, omitBackground: true });

// 5. RGB line
p = await open(320, 44, demoState({ timer: running(1500, 1100), config: { ...demoState().config, rgb_line: true } }));
await p.screenshot({ path: `${OUT}/5-rgb.png`, omitBackground: true });

// 6. line off
p = await open(320, 44, demoState({ timer: running(1500, 600), config: { ...demoState().config, progress_line: false } }));
console.log("line off -> svg count:", await p.locator(".progress-line svg").count());

// 7. hover opens after ~250 ms and closes ~400 ms after leaving
p = await open(140, 14, demoState());
await p.mouse.move(10, 5);
await p.waitForTimeout(150);
console.log("panel at 150 ms (expect 0):", await p.locator(".panel").count());
await p.waitForTimeout(250);
console.log("panel at 400 ms (expect 1):", await p.locator(".panel").count());
await p.locator(".widget-root").dispatchEvent("mouseout", { relatedTarget: null });
await p.waitForTimeout(250);
console.log("panel 250 ms after leaving (expect 1):", await p.locator(".panel").count());
await p.waitForTimeout(350);
console.log("panel 600 ms after leaving (expect 0):", await p.locator(".panel").count());
console.log("expanded calls:", JSON.stringify((await p.evaluate(() => (window as any).__calls)).filter((c: any[]) => c[0] === "set_widget_expanded")));

await browser.close();
```

Run: `cd "$LOCALAPPDATA/Temp/fb-shots" && mkdir -p shots && bun widget.shoot.ts shots`
Expected: `parked bar height: 6`; `line off -> svg count: 0`; os quatro `panel ...` com os valores indicados nos parênteses; `expanded calls: [["set_widget_expanded",{"expanded":true}],["set_widget_expanded",{"expanded":false}]]`; nenhuma linha `pageerror`.
Abrir as imagens de `shots/` (`Read`) e conferir: barra preta fina colada no topo sem nada dentro; caixa preta com cantos de baixo arredondados e o topo reto; relógio + `mm:ss` à esquerda e nome da tarefa à direita no Standard, nada dentro no Minimal; linha azul descendo pela esquerda, cruzando a base e subindo pela direita proporcional ao progresso (40 % e 60 %), e **sem linha no topo**; RGB com as cores do arco-íris.

- [ ] **Step 9: Commit**

```bash
cd D:/Projetos/focusbrew
git add src/Widget.tsx src/Widget.css src/widget
git commit -m "feat: notch widget - flat parked bar, running box, U-shaped progress line, hover to open" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: O painel — To Do com timer por tarefa e Activity

**Files:**
- Create: `src/widget/TaskRow.tsx`, `src/widget/ActivityGrid.tsx`
- Modify: `src/widget/TodoPanel.tsx` (trocar o miolo provisório), `src/Widget.css` (acrescentar o CSS do painel)

**Interfaces:**
- Consumes: `lib/tauri.ts` (`addTask`, `toggleTask`, `removeTask`, `updateTaskMinutes`, `reorderTasks`, `startTask`, `toggleTimerPause`), `lib/reorder.ts`, `lib/activity.ts`, `lib/progress.ts`, `icons.tsx`, `ProgressLine`.
- Produces: `TaskRow` (props abaixo), `ActivityGrid` (props `{ secsByDay: Record<string, number> }`); `TodoPanel` completo, chamando `onHold(true|false)` enquanto o campo de texto tem foco ou uma linha está sendo arrastada.

- [ ] **Step 1: A grade de atividade**

`src/widget/ActivityGrid.tsx`:

```tsx
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
```

- [ ] **Step 2: A linha de uma tarefa**

`src/widget/TaskRow.tsx`:

```tsx
import type { PointerEvent } from "react";
import type { Task, TimerView } from "../lib/types";
import { removeTask, startTask, toggleTask, toggleTimerPause, updateTaskMinutes } from "../lib/tauri";
import { formatClock, remainingSecs } from "../lib/progress";
import { CheckIcon, ClockIcon, GripIcon, PauseIcon, PlayIcon } from "./icons";

interface Props {
  task: Task;
  timer: TimerView;
  now: number;
  dragging: boolean;
  /** Where the drop guide line is drawn relative to this row, if at all. */
  guide: "before" | "after" | null;
  rowRef: (el: HTMLDivElement | null) => void;
  onHandleDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onHandleMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onHandleUp: () => void;
}

export default function TaskRow({
  task,
  timer,
  now,
  dragging,
  guide,
  rowRef,
  onHandleDown,
  onHandleMove,
  onHandleUp,
}: Props) {
  const active = timer.task_id === task.id && timer.status !== "idle";
  const running = active && timer.status === "running";
  const classes = [
    "task-row",
    active ? "active" : "",
    task.done ? "done" : "",
    dragging ? "dragging" : "",
    guide ? `guide-${guide}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rowRef} className={classes}>
      <button
        className="check"
        aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
        onClick={() => void toggleTask(task.id)}
      >
        {task.done && <CheckIcon />}
      </button>

      <div className="task-main">
        <div className="task-title" title={task.title}>
          {task.title}
        </div>
        {task.note && <div className="task-note">{task.note}</div>}
      </div>

      {!task.done && (
        <>
          <div className="minutes">
            <ClockIcon />
            <span className="minutes-value">
              {active ? formatClock(remainingSecs(timer, now)) : task.minutes}
            </span>
            <span className="stepper">
              <button aria-label="Mais 5 minutos" onClick={() => void updateTaskMinutes(task.id, task.minutes + 5)}>
                ▲
              </button>
              <button aria-label="Menos 5 minutos" onClick={() => void updateTaskMinutes(task.id, task.minutes - 5)}>
                ▼
              </button>
            </span>
          </div>
          <button
            className="play"
            aria-label={running ? "Pausar" : "Iniciar"}
            onClick={() => void (running ? toggleTimerPause() : startTask(task.id))}
          >
            {running ? <PauseIcon /> : <PlayIcon />}
          </button>
        </>
      )}

      <button className="remove" aria-label="Remover tarefa" onClick={() => void removeTask(task.id)}>
        ×
      </button>

      {!task.done && (
        <button
          className="handle"
          aria-label="Arrastar para reordenar"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <GripIcon />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: O painel completo**

`src/widget/TodoPanel.tsx` (arquivo inteiro):

```tsx
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { StateSnapshot } from "../lib/types";
import { addTask, reorderTasks } from "../lib/tauri";
import { dropIndex, moveItem } from "../lib/reorder";
import ActivityGrid from "./ActivityGrid";
import { BarsIcon } from "./icons";
import ProgressLine from "./ProgressLine";
import TaskRow from "./TaskRow";

interface Props {
  state: StateSnapshot;
  now: number;
  /** Tells the widget not to close while typing or dragging. */
  onHold: (hold: boolean) => void;
}

interface Drag {
  from: number;
  over: number;
}

export default function TodoPanel({ state, now, onHold }: Props) {
  const { timer, config } = state;
  const open = state.tasks.filter((t) => !t.done);
  const done = state.tasks.filter((t) => t.done);

  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());

  // `onHold` changes identity on every render of the widget (the clock ticks
  // 4 times a second); calling it from an effect that depends on it would
  // restart the close timer each time and the panel would never close.
  const holdRef = useRef(onHold);
  holdRef.current = onHold;
  useEffect(() => {
    holdRef.current(typing || drag !== null);
  }, [typing, drag]);
  useEffect(() => () => holdRef.current(false), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    void addTask(title);
    setDraft("");
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: index, over: index });
  };

  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const middles = open.map((t) => {
      const el = rows.current.get(t.id);
      if (!el) return 0;
      const box = el.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const over = dropIndex(middles, e.clientY, drag.from);
    if (over !== drag.over) setDrag({ from: drag.from, over });
  };

  const onHandleUp = () => {
    if (!drag) return;
    if (drag.over !== drag.from) {
      void reorderTasks(moveItem(open.map((t) => t.id), drag.from, drag.over));
    }
    setDrag(null);
  };

  // The guide line: before the row that would come after the dragged one, or
  // after the last of the *other* rows.
  const others = drag ? open.filter((_, i) => i !== drag.from) : [];
  const guideFor = (index: number): "before" | "after" | null => {
    if (!drag || index === drag.from) return null;
    const otherIndex = index < drag.from ? index : index - 1;
    if (otherIndex === drag.over) return "before";
    if (drag.over >= others.length && otherIndex === others.length - 1) return "after";
    return null;
  };

  return (
    <div className="panel">
      <div className="panel-body">
        <section className="todo">
          <h2>To Do</h2>
          <div className="task-list">
            {open.length === 0 && done.length === 0 && <p className="empty">Nenhuma tarefa ainda</p>}
            {open.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                timer={timer}
                now={now}
                dragging={drag?.from === i}
                guide={guideFor(i)}
                rowRef={(el) => {
                  if (el) rows.current.set(task.id, el);
                  else rows.current.delete(task.id);
                }}
                onHandleDown={(e) => onHandleDown(e, i)}
                onHandleMove={onHandleMove}
                onHandleUp={onHandleUp}
              />
            ))}
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                timer={timer}
                now={now}
                dragging={false}
                guide={null}
                rowRef={() => {}}
                onHandleDown={() => {}}
                onHandleMove={() => {}}
                onHandleUp={() => {}}
              />
            ))}
          </div>
          <form onSubmit={submit}>
            <input
              value={draft}
              maxLength={200}
              placeholder="Add a task"
              onChange={(e) => setDraft(e.currentTarget.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
            />
          </form>
        </section>

        <div className="divider" />

        <section className="activity">
          <h2>
            <BarsIcon /> Activity
          </h2>
          <ActivityGrid secsByDay={state.focus_secs_by_day} />
        </section>
      </div>

      <ProgressLine
        timer={timer}
        now={now}
        rgb={config.rgb_line}
        visible={config.progress_line && timer.status !== "idle"}
      />
    </div>
  );
}
```

- [ ] **Step 4: O CSS do painel**

Acrescentar ao fim de `src/Widget.css`:

```css
/* ---- panel content ---- */
.panel-body {
  box-sizing: border-box;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 1px minmax(0, 1fr);
  gap: 14px;
  padding: 14px 16px 12px;
  font-size: 13px;
}

.panel h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #f2f2f3;
}

.todo {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.divider {
  background: #1a1a1d;
}

.task-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}

.task-list::-webkit-scrollbar {
  width: 5px;
}
.task-list::-webkit-scrollbar-thumb {
  background: #2a2a2d;
  border-radius: 3px;
}

.empty {
  margin: 8px 0;
  color: #8a8a90;
  font-size: 12px;
}

.task-row {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  min-height: 32px;
  background: #1a1a1d;
  border-radius: 10px;
}

.task-row.active {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent);
}
.task-row.dragging {
  opacity: 0.45;
}
.task-row.guide-before::before,
.task-row.guide-after::after {
  content: "";
  position: absolute;
  left: 4px;
  right: 4px;
  height: 2px;
  border-radius: 1px;
  background: var(--accent);
}
.task-row.guide-before::before {
  top: -4px;
}
.task-row.guide-after::after {
  bottom: -4px;
}

.task-row :where(button) {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.check {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid #5a5a60;
  display: grid;
  place-items: center;
  color: #fff;
}
.task-row.done .check {
  background: var(--accent);
  border-color: var(--accent);
}

.task-main {
  flex: 1;
  min-width: 0;
}
.task-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-note {
  font-size: 11px;
  color: #8a8a90;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-row.done .task-title {
  color: #8a8a90;
  text-decoration: line-through;
}

.minutes {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  background: #26262a;
  border-radius: 9px;
  color: #c9c9ce;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.minutes-value {
  min-width: 18px;
  text-align: center;
}
.stepper {
  display: flex;
  flex-direction: column;
  line-height: 1;
}
.stepper button {
  font-size: 7px;
  line-height: 8px;
  color: #8a8a90;
}
.stepper button:hover {
  color: #f2f2f3;
}

.play {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: #fff;
}

.remove {
  flex: none;
  width: 14px;
  color: #8a8a90;
  font-size: 15px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.12s;
}
.task-row:hover .remove {
  opacity: 1;
}
.remove:hover {
  color: #ff453a;
}

.handle {
  flex: none;
  color: #5a5a60;
  cursor: grab;
  touch-action: none;
}
.handle:active {
  cursor: grabbing;
}

.todo form {
  margin-top: 8px;
}
.todo input {
  box-sizing: border-box;
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #f2f2f3;
  font: inherit;
  font-size: 12px;
  padding: 4px 2px;
}
.todo input::placeholder {
  color: #6a6a70;
}

.activity {
  min-width: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
  max-width: 150px;
}
.cell {
  aspect-ratio: 1;
  border-radius: 3.5px;
  background: #2a2a2d;
}
.cell.future {
  visibility: hidden;
}
.cell.level-1 {
  background: color-mix(in srgb, var(--accent) 30%, #0b0b0d);
}
.cell.level-2 {
  background: color-mix(in srgb, var(--accent) 55%, #0b0b0d);
}
.cell.level-3 {
  background: color-mix(in srgb, var(--accent) 80%, #0b0b0d);
}
.cell.level-4 {
  background: var(--accent);
}
```

- [ ] **Step 5: Tipos e testes**

Run: `npx tsc --noEmit && echo tsc-ok && npm test 2>&1 | tail -4`
Expected: `tsc-ok`; testes verdes.

- [ ] **Step 6: Conferir o painel com o backend de mentira**

Criar `panel.shoot.ts` na mesma pasta `%LOCALAPPDATA%\Temp\fb-shots` (com o Vite do projeto no ar):

```ts
import { chromium } from "playwright-core";
import { demoState, mockScript } from "./harness";

const OUT = process.argv[2] ?? ".";
const browser = await chromium.launch({ channel: "chrome" });

async function open(state: unknown) {
  const ctx = await browser.newContext({ viewport: { width: 470, height: 230 }, deviceScaleFactor: 3 });
  await ctx.addInitScript(mockScript("widget", state));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto("http://localhost:1420/");
  await page.mouse.move(20, 5); // hover -> the panel opens
  await page.waitForSelector(".panel");
  return page;
}
const calls = async (p: any, name: string) =>
  (await p.evaluate(() => (window as any).__calls)).filter((c: any[]) => c[0] === name);
const titles = (p: any) => p.locator(".task-row .task-title").allInnerTexts();

let p = await open(demoState());
await p.screenshot({ path: `${OUT}/10-painel.png` });
console.log("rows:", await p.locator(".task-row").count(), "(expect 4: 3 open + 1 done)");
console.log("done row last + struck:", (await titles(p)).at(-1));
console.log("grid squares:", await p.locator(".cell").count(), "(expect 28)");

// add a task: Enter adds it with the default minutes; blank does nothing
await p.locator(".todo input").click();
await p.locator(".todo input").fill("   ");
await p.locator(".todo input").press("Enter");
console.log("add_task calls after blank (expect 0):", (await calls(p, "add_task")).length);
await p.locator(".todo input").fill("Nova tarefa de teste");
await p.locator(".todo input").press("Enter");
console.log("titles now:", JSON.stringify(await titles(p)));

// stepper: +5 on the first task
await p.locator(".task-row").first().locator('[aria-label="Mais 5 minutos"]').click();
console.log("first task minutes (expect 50):", await p.locator(".task-row").first().locator(".minutes-value").innerText());

// play, then pause, then resume
const play = p.locator(".task-row").first().locator(".play");
await play.click();
await p.waitForTimeout(300);
console.log("active row:", await p.locator(".task-row.active .task-title").innerText(), "| countdown:", await p.locator(".task-row.active .minutes-value").innerText());
await p.screenshot({ path: `${OUT}/11-painel-rodando.png` });
await p.locator(".task-row.active .play").click();
await p.waitForTimeout(200);
console.log("pause calls (expect 1):", (await calls(p, "toggle_pause")).length);

// drag the 3rd open row's handle above the 1st
const rowsBefore = await titles(p);
const handle = p.locator(".task-row").nth(2).locator(".handle");
const box = await handle.boundingBox();
const firstBox = await p.locator(".task-row").first().boundingBox();
await p.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
await p.mouse.down();
await p.mouse.move(box!.x + 4, firstBox!.y - 2, { steps: 8 });
await p.screenshot({ path: `${OUT}/12-painel-arrastando.png` });
console.log("guide line shown:", await p.locator(".guide-before, .guide-after").count());
await p.mouse.up();
await p.waitForTimeout(200);
const reorder = await calls(p, "reorder_tasks");
console.log("reorder_tasks:", JSON.stringify(reorder.at(-1)?.[1]));
console.log("before:", JSON.stringify(rowsBefore));
console.log("after: ", JSON.stringify(await titles(p)));

// remove button only on hover, and it removes
const last = p.locator(".task-row").nth(1);
await last.hover();
await last.locator(".remove").click();
console.log("remove_task calls (expect 1):", (await calls(p, "remove_task")).length);

// empty state
const empty = await open(demoState({ tasks: [] }));
console.log("empty text:", await empty.locator(".empty").innerText());

await browser.close();
```

Run: `cd "$LOCALAPPDATA/Temp/fb-shots" && bun panel.shoot.ts shots`
Expected:
- `rows: 4`, `grid squares: 28`, o último título é "Responder e-mails" (concluída, no fim);
- `add_task calls after blank (expect 0): 0`; depois do Enter com texto, a nova tarefa aparece nos títulos;
- `first task minutes (expect 50): 50`;
- depois do play: `active row: Escrever o relatório trimestral` e uma contagem tipo `49:5x` ou `50:00`;
- `pause calls: 1`;
- durante o arraste, `guide line shown: 1` e, ao soltar, `reorder_tasks` chamado com os ids na nova ordem (a 3ª tarefa aberta em primeiro lugar) e os títulos de "after" refletem isso;
- `remove_task calls (expect 1): 1`; `empty text: Nenhuma tarefa ainda`; nenhuma linha `pageerror`.

Abrir `10-painel.png`, `11-painel-rodando.png`, `12-painel-arrastando.png` e conferir contra os prints de referência: painel escuro com To Do à esquerda (círculo, título + nota, pílula de minutos com setinhas, play azul redondo, alça de seis pontos), "Add a task" no fim, grade de quadradinhos em tons de azul à direita; a tarefa ativa com contorno azul e contagem no lugar dos minutos; a linha de progresso azul na borda do painel.

- [ ] **Step 7: Commit**

```bash
cd D:/Projetos/focusbrew
git add src/widget src/Widget.css
git commit -m "feat: To Do panel with a timer per task, drag to reorder, and the Activity grid" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: A janela de configurações

**Files:**
- Create: `src/settings/Row.tsx`, `src/settings/Switch.tsx`, `src/settings/FocusSection.tsx`, `src/settings/NotchSection.tsx`, `src/settings/GeneralSection.tsx`, `src/settings/colors.ts`, `src/settings/colors.test.ts`, `src/lib/minutes.ts`, `src/lib/minutes.test.ts`, `src/App.css` (novo, **escopado** em `.settings`)
- Modify: `src/App.tsx` (reescrever), `index.html` (título), `src-tauri/tauri.conf.json` (janela `main`)
- Modify (fora do repositório): `%LOCALAPPDATA%\Temp\fb-shots\harness.ts` (responder `plugin:app|version`)

**Interfaces:**
- Consumes: `updateSettings`, `getState`, `onStateChanged` de `tauri.ts`; `GithubPanel`; `AppConfig`, `NotchStyle`, `WidgetScale`.
- Produces:
  - `colors.ts`: `ACCENT_PRESETS: readonly { name: string; hex: string }[]` (6 cores), `normalizeHex(raw: string): string | null` (espelha `normalize_hex` do Rust)
  - `minutes.ts`: `MIN_MINUTES = 5`, `MAX_MINUTES = 180`, `clampMinutes(n: number): number` (espelha `clamp_minutes` do Rust)
  - `type SectionProps = { config: AppConfig; set: (patch: Partial<AppConfig>) => void }` (exportado de `src/settings/Row.tsx`)
  - cada seção é um componente default `(props: SectionProps) => JSX.Element`

- [ ] **Step 1: Escrever os testes que falham**

`src/settings/colors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS, normalizeHex } from "./colors";

describe("normalizeHex", () => {
  it("accepts #rrggbb in any case and writes it in upper case", () => {
    expect(normalizeHex("#ff9f0a")).toBe("#FF9F0A");
    expect(normalizeHex("#0A84FF")).toBe("#0A84FF");
    expect(normalizeHex("  #00ff7f  ")).toBe("#00FF7F");
  });

  it("refuses everything else", () => {
    for (const bad of ["red", "#12345", "#1234567", "#GGGGGG", "", "0A84FF", "#0A84F", "#"]) {
      expect(normalizeHex(bad), bad).toBeNull();
    }
  });
});

describe("ACCENT_PRESETS", () => {
  it("has six valid, distinct colors starting with the default blue", () => {
    expect(ACCENT_PRESETS).toHaveLength(6);
    expect(ACCENT_PRESETS[0].hex).toBe("#0A84FF");
    expect(new Set(ACCENT_PRESETS.map((p) => p.hex)).size).toBe(6);
    for (const preset of ACCENT_PRESETS) expect(normalizeHex(preset.hex)).toBe(preset.hex);
  });
});
```

`src/lib/minutes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clampMinutes, MAX_MINUTES, MIN_MINUTES } from "./minutes";

describe("clampMinutes", () => {
  // Must match `clamp_minutes` in src-tauri/src/tracker/tasks.rs.
  it("keeps 5..=180", () => {
    expect([MIN_MINUTES, MAX_MINUTES]).toEqual([5, 180]);
    expect(clampMinutes(0)).toBe(5);
    expect(clampMinutes(25)).toBe(25);
    expect(clampMinutes(999)).toBe(180);
  });

  it("rounds to a whole number of minutes", () => {
    expect(clampMinutes(24.6)).toBe(25);
    expect(clampMinutes(Number.NaN)).toBe(5);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test 2>&1 | tail -8`
Expected: falha por não achar `./colors` e `./minutes`.

- [ ] **Step 3: Implementar as duas contas**

`src/settings/colors.ts`:

```ts
/** Ready-made accent colors; the first is the default blue. */
export const ACCENT_PRESETS = [
  { name: "Azul", hex: "#0A84FF" },
  { name: "Roxo", hex: "#BF5AF2" },
  { name: "Rosa", hex: "#FF375F" },
  { name: "Laranja", hex: "#FF9F0A" },
  { name: "Verde", hex: "#30D158" },
  { name: "Turquesa", hex: "#64D2FF" },
] as const;

/** "#rrggbb" in any case (and surrounding spaces) -> "#RRGGBB"; anything else -> null. Mirrors `normalize_hex` in config.rs. */
export function normalizeHex(raw: string): string | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(raw.trim());
  return match ? `#${match[1].toUpperCase()}` : null;
}
```

`src/lib/minutes.ts`:

```ts
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 180;

/** Mirrors `clamp_minutes` in src-tauri/src/tracker/tasks.rs. */
export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)));
}
```

Run: `npm test 2>&1 | tail -6` — Expected: todos os testes verdes (agora com `colors` e `minutes`).

- [ ] **Step 4: Os blocos de interface**

`src/settings/Row.tsx`:

```tsx
import type { ReactNode } from "react";
import type { AppConfig } from "../lib/types";

export interface SectionProps {
  config: AppConfig;
  /** Applies a change right away (there is no Save button). */
  set: (patch: Partial<AppConfig>) => void;
}

interface RowProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

/** A line of a settings group: label on the left, the control on the right. */
export default function Row({ title, hint, children }: RowProps) {
  return (
    <div className="row">
      <div>
        <div className="row-title">{title}</div>
        {hint && <div className="row-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
```

`src/settings/Switch.tsx`:

```tsx
interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export default function Switch({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? "switch on" : "switch"}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
```

`src/settings/FocusSection.tsx`:

```tsx
import { useEffect, useState } from "react";
import { clampMinutes, MAX_MINUTES, MIN_MINUTES } from "../lib/minutes";
import Row from "./Row";
import type { SectionProps } from "./Row";
import Switch from "./Switch";

export default function FocusSection({ config, set }: SectionProps) {
  const [draft, setDraft] = useState(String(config.default_minutes));

  useEffect(() => {
    setDraft(String(config.default_minutes));
  }, [config.default_minutes]);

  const commit = () => {
    if (draft.trim() === "") {
      setDraft(String(config.default_minutes));
      return;
    }
    const minutes = clampMinutes(Number(draft));
    setDraft(String(minutes));
    if (minutes !== config.default_minutes) set({ default_minutes: minutes });
  };

  return (
    <>
      <p className="lead">Como uma tarefa nova nasce e o que acontece quando o tempo dela acaba.</p>
      <div className="group">
        <Row title="Minutos de uma tarefa nova" hint={`De ${MIN_MINUTES} a ${MAX_MINUTES} minutos.`}>
          <input
            type="number"
            className="minutes-input"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={5}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </Row>
        <Row title="Avisar quando o bloco terminar" hint="Uma notificação do Windows com o nome da tarefa.">
          <Switch
            label="Avisar quando o bloco terminar"
            checked={config.notify_on_finish}
            onChange={(notify_on_finish) => set({ notify_on_finish })}
          />
        </Row>
      </div>
    </>
  );
}
```

`src/settings/NotchSection.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { NotchStyle, WidgetScale } from "../lib/types";
import { ACCENT_PRESETS, normalizeHex } from "./colors";
import Row from "./Row";
import type { SectionProps } from "./Row";
import Switch from "./Switch";

const STYLES: { id: NotchStyle; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "minimal", label: "Minimal" },
];

const SCALES: { id: WidgetScale; label: string }[] = [
  { id: "small", label: "Pequeno" },
  { id: "medium", label: "Médio" },
  { id: "large", label: "Grande" },
];

/** A little drawing of the notch in each style. */
function Thumb({ style }: { style: NotchStyle }) {
  return (
    <div className="thumb">
      <div className={`thumb-notch ${style}`}>
        {style === "standard" && (
          <>
            <i className="t-clock" />
            <i className="t-title" />
          </>
        )}
        <b className="t-line" />
      </div>
    </div>
  );
}

export default function NotchSection({ config, set }: SectionProps) {
  const [hex, setHex] = useState(config.accent_color);

  useEffect(() => {
    setHex(config.accent_color);
  }, [config.accent_color]);

  const commitHex = () => {
    const valid = normalizeHex(hex);
    if (valid) set({ accent_color: valid });
    else setHex(config.accent_color);
  };

  return (
    <>
      <p className="lead">O que o widget mostra no topo da tela enquanto um bloco roda.</p>

      <div className="cards" role="radiogroup" aria-label="Estilo do notch">
        {STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={config.notch_style === style.id}
            className={config.notch_style === style.id ? "notch-card selected" : "notch-card"}
            onClick={() => set({ notch_style: style.id })}
          >
            <Thumb style={style.id} />
            {style.label}
          </button>
        ))}
      </div>
      <p className="row-hint cards-hint">
        Standard mostra a contagem à esquerda e a tarefa à direita; Minimal mostra só a caixa e a linha.
      </p>

      <div className="group">
        <Row title="Progress timeline" hint="Uma linha em volta do widget que se enche enquanto o bloco roda.">
          <Switch
            label="Progress timeline"
            checked={config.progress_line}
            onChange={(progress_line) => set({ progress_line })}
          />
        </Row>
        <Row title="RGB timeline" hint="Arco-íris animado com brilho suave no lugar da cor de destaque.">
          <Switch label="RGB timeline" checked={config.rgb_line} onChange={(rgb_line) => set({ rgb_line })} />
        </Row>
      </div>

      <div className="group">
        <Row title="Cor de destaque" hint="Botão play, grade Activity e contorno do painel.">
          <div className="swatches">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                role="radio"
                aria-checked={config.accent_color === preset.hex}
                aria-label={preset.name}
                title={preset.name}
                className="swatch"
                style={{ background: preset.hex }}
                onClick={() => set({ accent_color: preset.hex })}
              />
            ))}
            <input
              type="text"
              className="hex"
              aria-label="Cor em hexadecimal"
              value={hex}
              maxLength={7}
              onChange={(e) => setHex(e.currentTarget.value)}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
        </Row>
        <Row title="Tamanho" hint="Da barra, da caixa e do painel.">
          <div className="segmented" role="radiogroup" aria-label="Tamanho do widget">
            {SCALES.map((scale) => (
              <button
                key={scale.id}
                type="button"
                role="radio"
                aria-checked={config.widget_scale === scale.id}
                onClick={() => set({ widget_scale: scale.id })}
              >
                {scale.label}
              </button>
            ))}
          </div>
        </Row>
      </div>
    </>
  );
}
```

`src/settings/GeneralSection.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import Row from "./Row";
import type { SectionProps } from "./Row";
import Switch from "./Switch";

export default function GeneralSection({ config, set }: SectionProps) {
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then((v) => setVersion(String(v)))
      .catch(() => setVersion(""));
  }, []);

  return (
    <div className="group">
      <Row title="Mostrar o widget" hint="A barra no topo da tela. Também dá pra alternar pelo ícone da bandeja.">
        <Switch
          label="Mostrar o widget"
          checked={config.widget_visible}
          onChange={(widget_visible) => set({ widget_visible })}
        />
      </Row>
      <Row title="Versão" hint="Atalho global: Ctrl+Shift+Space pausa/retoma o bloco, ou inicia a primeira tarefa.">
        <span className="version">{version ? `focusbrew ${version}` : "focusbrew"}</span>
      </Row>
    </div>
  );
}
```

- [ ] **Step 5: A janela**

`src/App.tsx` (arquivo inteiro):

```tsx
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { AppConfig, StateSnapshot } from "./lib/types";
import { getState, onStateChanged, updateSettings } from "./lib/tauri";
import GithubPanel from "./components/GithubPanel";
import FocusSection from "./settings/FocusSection";
import GeneralSection from "./settings/GeneralSection";
import NotchSection from "./settings/NotchSection";
import "./App.css";

type Section = "focus" | "notch" | "general" | "github";

const SECTIONS: { id: Section; label: string; glyph: string; color: string }[] = [
  { id: "focus", label: "Foco", glyph: "⏱", color: "#ff9f0a" },
  { id: "notch", label: "Notch", glyph: "▭", color: "#0a84ff" },
  { id: "general", label: "Geral", glyph: "⚙", color: "#8e8e93" },
  { id: "github", label: "GitHub", glyph: "⌥", color: "#30d158" },
];

export default function App() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [section, setSection] = useState<Section>("focus");

  useEffect(() => {
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!state) {
    return <div className="settings loading">Carregando...</div>;
  }

  const set = (patch: Partial<AppConfig>) => {
    void updateSettings({ ...state.config, ...patch });
  };
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="settings" style={{ "--accent": state.config.accent_color } as CSSProperties}>
      <nav className="sidebar" aria-label="Configurações">
        <div className="brand">focusbrew</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === section ? "nav-item active" : "nav-item"}
            onClick={() => setSection(s.id)}
          >
            <span className="nav-glyph" style={{ background: s.color }}>
              {s.glyph}
            </span>
            {s.label}
          </button>
        ))}
      </nav>
      <main className="content">
        <h1>{current.label}</h1>
        {section === "focus" && <FocusSection config={state.config} set={set} />}
        {section === "notch" && <NotchSection config={state.config} set={set} />}
        {section === "general" && <GeneralSection config={state.config} set={set} />}
        {section === "github" && <GithubPanel state={state} />}
      </main>
    </div>
  );
}
```

`index.html`: trocar `<title>Tauri + React + Typescript</title>` por `<title>focusbrew</title>`.

`src-tauri/tauri.conf.json`: no objeto da janela `main`, trocar `"title": "focusbrew", "width": 680, "height": 640,` por:

```json
        "title": "focusbrew — Configurações",
        "width": 760,
        "height": 540,
        "minWidth": 640,
        "minHeight": 420,
        "center": true,
```

(mantendo `"label": "main"` e `"visible": false`).

- [ ] **Step 6: O CSS (tudo dentro de `.settings`, porque as duas janelas compartilham o pacote)**

`src/App.css`:

```css
.settings {
  --accent: #0a84ff;
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: 190px 1fr;
  background: #1c1c1e;
  color: #f2f2f3;
  font: 13px/1.4 "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
}
.settings *,
.settings *::before,
.settings *::after {
  box-sizing: border-box;
}
.settings.loading {
  display: grid;
  place-items: center;
  color: #8a8a90;
}

/* ---- sidebar ---- */
.settings .sidebar {
  background: #161618;
  border-right: 1px solid #2a2a2d;
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings .brand {
  padding: 2px 10px 14px;
  font-size: 15px;
  font-weight: 700;
}
.settings .nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: none;
  color: #d6d6da;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.settings .nav-item:hover {
  background: #232326;
}
.settings .nav-item.active {
  background: var(--accent);
  color: #fff;
}
.settings .nav-glyph {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: #fff;
}

/* ---- content ---- */
.settings .content {
  padding: 22px 28px;
  overflow-y: auto;
}
.settings .content h1 {
  margin: 0 0 4px;
  font-size: 20px;
}
.settings .lead {
  margin: 0 0 18px;
  color: #8a8a90;
}

.settings .group {
  background: #232326;
  border-radius: 12px;
  margin: 0 0 16px;
}
.settings .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
}
.settings .row + .row {
  border-top: 1px solid #2e2e32;
}
.settings .row-title {
  font-weight: 600;
}
.settings .row-hint {
  color: #8a8a90;
  font-size: 12px;
}
.settings .version {
  color: #8a8a90;
  white-space: nowrap;
}

/* ---- controls ---- */
.settings .switch {
  flex: none;
  width: 40px;
  height: 24px;
  padding: 2px;
  border: none;
  border-radius: 12px;
  background: #3a3a3e;
  cursor: pointer;
  transition: background 0.15s;
}
.settings .switch span {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.settings .switch.on {
  background: var(--accent);
}
.settings .switch.on span {
  transform: translateX(16px);
}

.settings .segmented {
  display: flex;
  padding: 2px;
  border-radius: 8px;
  background: #2e2e32;
}
.settings .segmented button {
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  background: none;
  color: #d6d6da;
  font: inherit;
  cursor: pointer;
}
.settings .segmented button[aria-checked="true"] {
  background: var(--accent);
  color: #fff;
}

.settings .swatches {
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings .swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}
.settings .swatch[aria-checked="true"] {
  border-color: #fff;
}

.settings input[type="text"],
.settings input[type="number"],
.settings input[type="password"] {
  padding: 6px 10px;
  border: 1px solid #3a3a3e;
  border-radius: 8px;
  background: #2e2e32;
  color: inherit;
  font: inherit;
}
.settings input:focus {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.settings .hex {
  width: 92px;
  font-family: ui-monospace, Consolas, monospace;
}
.settings .minutes-input {
  width: 76px;
}

/* ---- the Standard / Minimal cards ---- */
.settings .cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 6px;
}
.settings .cards-hint {
  margin: 0 0 16px;
}
.settings .notch-card {
  padding: 10px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #232326;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.settings .notch-card.selected {
  border-color: var(--accent);
}
.settings .thumb {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  height: 78px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: linear-gradient(135deg, #2b2f6b, #4a2a6e 60%, #1d1633);
}
.settings .thumb-notch {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 118px;
  height: 26px;
  padding: 0 10px;
  border-radius: 0 0 9px 9px;
  background: #000;
}
.settings .thumb-notch.minimal {
  justify-content: center;
}
.settings .t-clock {
  width: 26px;
  height: 5px;
  border-radius: 3px;
  background: #e5e5ea;
}
.settings .t-title {
  width: 32px;
  height: 4px;
  border-radius: 2px;
  background: #6a6a70;
}
.settings .t-line {
  position: absolute;
  inset: 0;
  border: 1.5px solid var(--accent);
  border-top: none;
  border-radius: 0 0 9px 9px;
}

/* ---- the GitHub section (components/GithubPanel.tsx keeps its own markup) ---- */
.settings .github-panel p {
  margin: 0 0 10px;
}
.settings .github-panel .hint {
  margin-top: 18px;
  color: #8a8a90;
}
.settings .github-panel code {
  padding: 1px 5px;
  border-radius: 4px;
  background: #2e2e32;
}
.settings .github-panel a {
  color: var(--accent);
  text-decoration: none;
}
.settings .github-panel button {
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: #2e2e32;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.settings .github-panel button:hover {
  background: #38383c;
}
.settings .github-panel button:disabled {
  opacity: 0.6;
  cursor: default;
}
.settings .github-panel button.secondary {
  background: none;
  border: 1px solid #5c2b2b;
  color: #ff6961;
}
.settings .task-form {
  display: flex;
  gap: 8px;
}
.settings .task-form input {
  flex: 1;
}
.settings .github-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.settings .github-header div {
  display: flex;
  gap: 8px;
}
.settings .github-source {
  color: #8a8a90;
  font-weight: normal;
}
.settings .github-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.settings .github-row {
  padding: 10px 12px;
  border-radius: 10px;
  background: #232326;
}
.settings .github-row a {
  color: #f2f2f3;
  font-weight: 600;
}
.settings .github-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  color: #8a8a90;
  font-size: 12px;
}
.settings .error {
  color: #ff6961;
}
.settings .empty {
  color: #8a8a90;
}
```

- [ ] **Step 7: Tipos, testes e build**

Run: `npx tsc --noEmit && echo tsc-ok && npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -3`
Expected: `tsc-ok`; testes verdes; build do Vite sem erro.

- [ ] **Step 8: Conferir a janela com o backend de mentira**

Em `%LOCALAPPDATA%\Temp\fb-shots\harness.ts`, dentro do `invoke(cmd, args)` do `mockScript`, logo depois da linha `if (cmd.startsWith("plugin:event|")) return Promise.resolve(null);`, acrescentar:

```js
        if (cmd === "plugin:app|version") return Promise.resolve("0.2.0");
```

Criar `settings.shoot.ts` na mesma pasta (com o Vite do projeto no ar):

```ts
import { chromium } from "playwright-core";
import { demoState, mockScript } from "./harness";

const OUT = process.argv[2] ?? ".";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 760, height: 540 }, deviceScaleFactor: 2 });
await ctx.addInitScript(mockScript("main", demoState()));
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto("http://localhost:1420/");
await page.waitForSelector(".settings .sidebar");

const calls = async (name: string) =>
  (await page.evaluate(() => (window as any).__calls)).filter((c: any[]) => c[0] === name).map((c: any[]) => c[1]?.newConfig);
const nav = (name: string) => page.locator(".nav-item", { hasText: name }).click();
const last = async () => (await calls("update_settings")).at(-1);

// Foco
await page.screenshot({ path: `${OUT}/20-foco.png` });
const minutes = page.locator(".minutes-input");
await minutes.fill("999");
await minutes.press("Enter");
console.log("minutes field after 999 (expect 180):", await minutes.inputValue(), "| sent:", (await last())?.default_minutes);
await minutes.fill("");
await minutes.press("Enter");
console.log("minutes field after empty (expect 180):", await minutes.inputValue());
await page.getByRole("switch", { name: "Avisar quando o bloco terminar" }).click();
console.log("notify_on_finish sent (expect false):", (await last())?.notify_on_finish);

// Notch
await nav("Notch");
await page.screenshot({ path: `${OUT}/21-notch.png` });
await page.getByRole("radio", { name: /Minimal/ }).click();
console.log("notch_style (expect minimal):", (await last())?.notch_style);
await page.getByRole("switch", { name: "RGB timeline" }).click();
console.log("rgb_line (expect true):", (await last())?.rgb_line);
await page.getByRole("switch", { name: "Progress timeline" }).click();
console.log("progress_line (expect false):", (await last())?.progress_line);
await page.getByRole("radio", { name: "Laranja" }).click();
console.log("accent after swatch (expect #FF9F0A):", (await last())?.accent_color);
const hex = page.locator(".hex");
const before = (await calls("update_settings")).length;
await hex.fill("not-a-color");
await hex.press("Enter");
console.log("invalid hex sends nothing (expect 0):", (await calls("update_settings")).length - before, "| field reverted to:", await hex.inputValue());
await hex.fill("#12ab9c");
await hex.press("Enter");
console.log("valid hex (expect #12AB9C):", (await last())?.accent_color, "| field:", await hex.inputValue());
await page.getByRole("radio", { name: "Grande" }).click();
console.log("widget_scale (expect large):", (await last())?.widget_scale);
await page.screenshot({ path: `${OUT}/22-notch-depois.png` });

// Geral
await nav("Geral");
console.log("version text:", await page.locator(".version").innerText());
await page.getByRole("switch", { name: "Mostrar o widget" }).click();
console.log("widget_visible (expect false):", (await last())?.widget_visible);
await page.screenshot({ path: `${OUT}/23-geral.png` });

// GitHub
await nav("GitHub");
await page.screenshot({ path: `${OUT}/24-github.png` });

await browser.close();
```

Run: `cd "$LOCALAPPDATA/Temp/fb-shots" && bun settings.shoot.ts shots`
Expected: `minutes field after 999: 180` e enviado `180`; depois de apagar o campo e dar Enter, volta pra `180`; `notify_on_finish ... false`; `notch_style ... minimal`; `rgb_line ... true`; `progress_line ... false`; `accent after swatch ... #FF9F0A`; hex inválido envia `0` mudanças e o campo volta pra `#FF9F0A`; hex válido vira `#12AB9C` (maiúsculas); `widget_scale ... large`; versão `focusbrew 0.2.0`; `widget_visible ... false`; nenhuma linha `pageerror`.
Abrir as imagens e conferir: menu lateral escuro com os quatro itens e o ativo em azul; seção Notch com os dois cartões (o selecionado com contorno azul e a miniatura); interruptores, cores prontas, campo hex e os três tamanhos; a cor de destaque mudando o item ativo do menu depois de escolher outra.

- [ ] **Step 9: Commit**

```bash
cd D:/Projetos/focusbrew
git add -A src index.html src-tauri/tauri.conf.json
git commit -m "feat: settings window with a sidebar - Foco, Notch, Geral and GitHub" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verificação no app de verdade

O `harness.ts` simula o backend; esta tarefa confirma tudo **no executável de verdade**, no Windows, com o monitor real. O app novo usa a mesma pasta de dados do app instalado (`%APPDATA%\sthevandev\focusbrew`), e ao salvar ele descarta os campos antigos de `activity.json`; por isso a primeira coisa é guardar uma cópia e a última é restaurar.

**Files:**
- Nada no repositório, exceto correções que os testes aqui mostrarem necessárias (cada correção com o seu commit e, se for lógica, com teste).
- Scripts temporários em `%LOCALAPPDATA%\Temp\fb-e2e\` (fora do repositório).

- [ ] **Step 1: Cópia de segurança dos dados e build do executável**

```powershell
$data = "$env:APPDATA\sthevandev\focusbrew"
$bak  = "$env:LOCALAPPDATA\Temp\fb-e2e\backup"
New-Item -ItemType Directory -Force $bak | Out-Null
if (Test-Path $data) { Copy-Item $data $bak -Recurse -Force }
Get-ChildItem $bak -Recurse | Select-Object FullName
Get-Process focusbrew -ErrorAction SilentlyContinue | Stop-Process -Force
Set-Location D:\Projetos\focusbrew
npx tauri build --no-bundle 2>&1 | Select-String -Pattern "error|warning|Finished"
```

Expected: a cópia lista os arquivos que existirem (pode estar vazia se o app instalado nunca criou dados); o build termina com `Finished` e sem `error`/`warning`.

- [ ] **Step 2: Script de medição (janela, mouse e tecla)**

`%LOCALAPPDATA%\Temp\fb-e2e\win.ps1` (funções reaproveitadas pelos passos seguintes; carregar com `. $env:LOCALAPPDATA\Temp\fb-e2e\win.ps1`):

```powershell
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static List<IntPtr> ForPid(uint pid) {
    var l = new List<IntPtr>();
    EnumWindows((h, p) => { uint x; GetWindowThreadProcessId(h, out x); if (x == pid && IsWindowVisible(h)) l.Add(h); return true; }, IntPtr.Zero);
    return l;
  }
}
"@

# Without this, a DPI-unaware PowerShell gets virtualized (scaled) rectangles and
# cursor coordinates, and dividing by the window DPI gives wrong sizes.
[void][W]::SetProcessDPIAware()

# The widget is the visible window of the process that is NOT the settings window:
# the one whose top touches the screen top (y = 0) and that is wider than tall.
function Get-Widget {
  $p = Get-Process focusbrew -ErrorAction Stop | Select-Object -First 1
  foreach ($h in [W]::ForPid([uint32]$p.Id)) {
    $r = New-Object W+RECT; [void][W]::GetWindowRect($h, [ref]$r)
    if ($r.T -le 0 -and ($r.R - $r.L) -gt ($r.B - $r.T) -and ($r.R - $r.L) -lt 900) {
      $dpi = [W]::GetDpiForWindow($h); $s = $dpi / 96.0
      return [pscustomobject]@{ H = $h; Left = $r.L; Top = $r.T; W = $r.R - $r.L; Ht = $r.B - $r.T; Scale = $s;
        LogicalW = [math]::Round(($r.R - $r.L) / $s); LogicalH = [math]::Round(($r.B - $r.T) / $s) }
    }
  }
  return $null
}

function Move-Mouse([int]$x, [int]$y) { [void][W]::SetCursorPos($x, $y) }

function Send-Hotkey { # Ctrl+Shift+Space
  [W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [W]::keybd_event(0x10,0,0,[UIntPtr]::Zero)
  [W]::keybd_event(0x20,0,0,[UIntPtr]::Zero); [W]::keybd_event(0x20,0,2,[UIntPtr]::Zero)
  [W]::keybd_event(0x10,0,2,[UIntPtr]::Zero); [W]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
}
```

- [ ] **Step 3: A barra parada fica colada no topo e abre com o mouse**

```powershell
. $env:LOCALAPPDATA\Temp\fb-e2e\win.ps1
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Start-Process D:\Projetos\focusbrew\src-tauri\target\release\focusbrew.exe
Start-Sleep 5
$w = Get-Widget
"parked: top=$($w.Top) left=$($w.Left) logical=$($w.LogicalW)x$($w.LogicalH) scale=$($w.Scale)"
$screenW = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
"centered? left+width/2 = $($w.Left + $w.W/2)  vs screen/2 = $($screenW/2)"
$cx = [int]($w.Left + $w.W/2)
Move-Mouse $cx 3;  Start-Sleep -Milliseconds 700; $o = Get-Widget
"open  (mouse at the top, 700 ms): $($o.LogicalW)x$($o.LogicalH)  top=$($o.Top)"
Move-Mouse $cx 700; Start-Sleep -Milliseconds 900; $c = Get-Widget
"closed (mouse away, 900 ms):      $($c.LogicalW)x$($c.LogicalH)  top=$($c.Top)"
```

Expected: `parked: top=0` (ou o topo do monitor), `logical=140x14`, o centro da janela ≈ o centro da tela; com o mouse em cima, **`470x230`**; com o mouse longe, volta a **`140x14`**.

Se o tamanho **parado** não for `140x14` (o Windows pode impor uma altura mínima), anotar a altura medida `H` e corrigir: em `src-tauri/src/widget.rs` trocar `IDLE_SIZE` por `(140.0, H)` e ajustar os testes `medium_sizes_follow_the_state` e `small_and_large_scale_every_size` (e a seção 4 da spec); a barra continua com 6 px desenhados no topo e o resto da janela transparente. Se a janela **não abrir** com o mouse (a área transparente não reage), aplicar em `src/Widget.css`, regra `.widget-root`: `background: rgba(0, 0, 0, 0.01);` e repetir o passo.

- [ ] **Step 4: Adicionar tarefa, rodar, linha enchendo e caixa crescendo (via CDP)**

`%LOCALAPPDATA%\Temp\fb-e2e\run.ts` (dentro dessa pasta: `bun init -y; bun add playwright-core`):

```ts
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const pages = browser.contexts().flatMap((c) => c.pages());
let widget: any = null;
for (const p of pages) if ((await p.locator(".widget-root").count().catch(() => 0)) > 0) widget = p;
if (!widget) throw new Error("widget page not found");

// open the panel with real mouse events inside the page
await widget.mouse.move(20, 4);
await widget.waitForSelector(".panel", { timeout: 3000 });

const input = widget.locator(".todo input");
await input.click();
await input.fill("   ");
await input.press("Enter");
console.log("rows after blank (expect unchanged):", await widget.locator(".task-row").count());
const long = "Tarefa com acentuação e emoji 🚀 ".repeat(20);
await input.fill(long);
console.log("input length after filling 600+ chars:", (await input.inputValue()).length, "(the field allows 200; the backend also cuts to 200 characters)");
await input.press("Enter");
await input.fill("Revisar o PR do focusbrew");
await input.press("Enter");
await widget.waitForTimeout(400);
console.log("titles:", JSON.stringify(await widget.locator(".task-row .task-title").allInnerTexts()));

// start the last task (the one just added) with a real click
const row = widget.locator(".task-row", { hasText: "Revisar o PR do focusbrew" });
await row.locator(".play").click();
await widget.waitForTimeout(500);
console.log("active row countdown:", await widget.locator(".task-row.active .minutes-value").innerText());

// the progress line fills while it runs
await widget.mouse.move(20, 400); // leave -> panel closes, box stays
await widget.waitForTimeout(1200);
const offset = () => widget.locator(".progress-fill").getAttribute("stroke-dashoffset").then(Number);
const a = await offset();
await widget.waitForTimeout(15000);
const b = await offset();
console.log("dashoffset now vs 15 s later (expect smaller later):", a.toFixed(3), "->", b.toFixed(3), b < a ? "OK" : "NOT MOVING");
console.log("notch box present:", await widget.locator(".notch-box").count(), "| clock:", await widget.locator(".notch-time").innerText());

await browser.close();
```

Run: `cd "$LOCALAPPDATA/Temp/fb-e2e" && bun run.ts`
Expected: a linha em branco **não** adiciona tarefa; o campo recusa passar de 200 caracteres; a tarefa aparece nos títulos; ao dar play o relógio da linha ativa aparece (`25:00` ou `24:5x`); `dashoffset` diminui entre as duas leituras (`OK`); `notch box present: 1`.

Depois, no PowerShell, medir a caixa rodando:

```powershell
. $env:LOCALAPPDATA\Temp\fb-e2e\win.ps1
Move-Mouse 10 700; Start-Sleep -Milliseconds 800
$r = Get-Widget; "running box: $($r.LogicalW)x$($r.LogicalH) top=$($r.Top)"
```

Expected: `320x44`, `top=0`.

- [ ] **Step 5: Pausar pelo atalho, estresse do atalho e estado salvo**

```powershell
. $env:LOCALAPPDATA\Temp\fb-e2e\win.ps1
Send-Hotkey; Start-Sleep -Milliseconds 600
# the pill pulses while paused: read it through the page
cd $env:LOCALAPPDATA\Temp\fb-e2e
@'
import { chromium } from "playwright-core";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
for (const p of b.contexts().flatMap((c) => c.pages())) {
  if ((await p.locator(".widget-root").count().catch(() => 0)) > 0) console.log("paused box:", await p.locator(".notch-box.paused").count());
}
await b.close();
'@ | Set-Content paused.ts
bun paused.ts
Send-Hotkey; Start-Sleep -Milliseconds 600   # resume

# stress: 150 presses must not freeze the app
$p = Get-Process focusbrew | Select-Object -First 1
for ($i = 1; $i -le 150; $i++) { Send-Hotkey; Start-Sleep -Milliseconds 170; $p.Refresh(); if (-not $p.Responding) { "HUNG after $i presses"; break } }
$p.Refresh(); "after 150 presses -> responding: $($p.Responding)"
# the blocks are saved: the task has the time worked
Get-Content "$env:APPDATA\sthevandev\focusbrew\data\tasks.json" | Select-String '"title"|"minutes"|"spent_secs"'
Get-Content "$env:APPDATA\sthevandev\focusbrew\data\activity.json"
# the 600-character title was cut to 200 *characters* (an emoji counts as one)
(Get-Content "$env:APPDATA\sthevandev\focusbrew\data\tasks.json" -Raw | ConvertFrom-Json) |
  ForEach-Object { "{0,4} chars  {1}" -f ($_.title.EnumerateRunes() | Measure-Object).Count, $_.title.Substring(0, [Math]::Min(30, $_.title.Length)) }
```

Expected: `paused box: 1`; `after 150 presses -> responding: True` (sem `HUNG`); `tasks.json` com `minutes`, `spent_secs` e o título com os acentos e o emoji intactos; a tarefa longa com no máximo `200 chars` (a lista acima mostra a contagem de caracteres de cada título); `activity.json` só com `focus_secs_by_day`.

- [ ] **Step 6: Janela de configurações — escala e cor no widget de verdade**

```powershell
. $env:LOCALAPPDATA\Temp\fb-e2e\win.ps1
Start-Process D:\Projetos\focusbrew\src-tauri\target\release\focusbrew.exe   # 2nd launch -> opens the settings window
Start-Sleep 2
cd $env:LOCALAPPDATA\Temp\fb-e2e
@'
import { chromium } from "playwright-core";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
for (const p of b.contexts().flatMap((c) => c.pages())) {
  if ((await p.locator(".settings").count().catch(() => 0)) > 0) {
    await p.locator(".nav-item", { hasText: "Notch" }).click();
    await p.getByRole("radio", { name: "Grande" }).click();
    await p.getByRole("radio", { name: "Rosa" }).click();
    await p.waitForTimeout(500);
    console.log("settings applied: scale large + accent pink");
  }
}
await b.close();
'@ | Set-Content settings.ts
bun settings.ts
Start-Sleep -Milliseconds 800
$w = Get-Widget; "running box at Grande: $($w.LogicalW)x$($w.LogicalH) (expect 400x55)  top=$($w.Top)"
Get-Content "$env:APPDATA\sthevandev\focusbrew\config\settings.json" | Select-String 'accent_color|widget_scale|github_use_gh'
```

Expected: `settings applied`; caixa `400x55` (320×1,25 × 44×1,25), `top=0`; `settings.json` com `"accent_color": "#FF375F"` e `"widget_scale": "large"`.

Capturar a tela do widget real pra conferir o visual (a barra preta colada no topo, a linha rosa): `Get-Widget` + `PrintWindow` como em sessões anteriores, ou um print do monitor, e olhar a imagem.

- [ ] **Step 7: Um bloco que termina de verdade (5 minutos)**

Pela página do widget (CDP), colocar a tarefa "Revisar o PR do focusbrew" em **5 minutos** (clicar ▼ até 5 ou usar a seta do campo) e dar play; seguir com outros passos e voltar depois de 5 min e meio. Conferir:

```powershell
Get-Content "$env:APPDATA\sthevandev\focusbrew\data\tasks.json" | Select-String '"title"|"done"|"spent_secs"'
Get-Content "$env:APPDATA\sthevandev\focusbrew\data\activity.json"
```

Expected: a tarefa continua com `"done": false`, `spent_secs` somou pelo menos 300 e o dia de hoje em `focus_secs_by_day` passou de 300; o widget voltou à barra parada; apareceu a notificação do Windows "Bloco concluído" (confirmar na Central de Notificações).

- [ ] **Step 8: Fechar, restaurar os dados e commitar correções**

```powershell
Get-Process focusbrew -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
$data = "$env:APPDATA\sthevandev\focusbrew"
Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path "$env:LOCALAPPDATA\Temp\fb-e2e\backup\focusbrew") { Copy-Item "$env:LOCALAPPDATA\Temp\fb-e2e\backup\focusbrew" $data -Recurse -Force }
Start-Process "$env:LOCALAPPDATA\focusbrew\focusbrew.exe"
```

(reinicia o app instalado, como estava antes dos testes). Se algum passo acima exigiu correção no código, ela já foi feita com o seu commit (`fix: ...`), com teste quando for lógica. Conferir `git status` limpo (exceto `src-tauri/Cargo.toml`, que só difere em quebra de linha).

---

### Task 13: README, versão 0.2.0, instalador assinado e release

**Files:**
- Modify: `README.md` (reescrever), `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`
- Delete: os 8 prints antigos de `docs/screenshots/`
- Create: `docs/screenshots/{widget-parado,widget-rodando,widget-minimal,widget-rgb,painel,configuracoes}.png`
- Create (fora do repositório): `%LOCALAPPDATA%\Temp\fb-shots\readme.shoot.ts`

**Interfaces:**
- Consumes: o app inteiro, o `harness.ts`.
- Produces: o PR da etapa 1 e, depois do merge e do ok do Sthevan, a release `v0.2.0`.

- [ ] **Step 1: Os prints do README (dados de demonstração)**

`%LOCALAPPDATA%\Temp\fb-shots\readme.shoot.ts` (com o Vite do projeto no ar). Ele coloca cada janela num fundo degradê, como se fosse a área de trabalho, sobrescrevendo só o CSS dentro da página de captura:

```ts
import { chromium } from "playwright-core";
import { demoState, mockScript } from "./harness";

const OUT = process.argv[2] ?? ".";
const browser = await chromium.launch({ channel: "chrome" });

const BACKDROP = "linear-gradient(135deg, #1b2257 0%, #3b2468 55%, #1b1233 100%)";
const run = (planned: number, elapsed: number) => ({
  status: "running", task_id: "1", planned_secs: planned, remaining_secs: 0, deadline_ms: Date.now() + (planned - elapsed) * 1000,
});

/** A widget window of w x h inside a larger "desktop" picture. */
async function widgetShot(file: string, w: number, h: number, state: unknown, hover = false) {
  const ctx = await browser.newContext({ viewport: { width: w + 120, height: h + 56 }, deviceScaleFactor: 3 });
  await ctx.addInitScript(mockScript("widget", state));
  const page = await ctx.newPage();
  await page.goto("http://localhost:1420/");
  await page.addStyleTag({
    content: `html{background:${BACKDROP}!important;padding:0 60px 24px;box-sizing:border-box}
      .widget-root{width:${w}px!important;height:${h}px!important;margin:0 auto}
      .scaled{width:${w}px!important;height:${h}px!important}`,
  });
  if (hover) {
    await page.mouse.move(w / 2 + 60, 4);
    await page.waitForSelector(".panel");
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${file}` });
}

const base = demoState();
await widgetShot("widget-parado.png", 140, 14, base);
await widgetShot("widget-rodando.png", 320, 44, demoState({ timer: run(1500, 540) }));
await widgetShot("widget-minimal.png", 320, 44, demoState({ timer: run(1500, 900), config: { ...base.config, notch_style: "minimal" } }));
await widgetShot("widget-rgb.png", 320, 44, demoState({ timer: run(1500, 1000), config: { ...base.config, rgb_line: true } }));
await widgetShot("painel.png", 470, 230, demoState({ timer: run(2700, 900) }), true);

// the settings window, on the Notch section
const ctx = await browser.newContext({ viewport: { width: 760, height: 540 }, deviceScaleFactor: 2 });
await ctx.addInitScript(mockScript("main", base));
const page = await ctx.newPage();
await page.goto("http://localhost:1420/");
await page.locator(".nav-item", { hasText: "Notch" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/configuracoes.png` });

await browser.close();
```

Run: `cd "$LOCALAPPDATA/Temp/fb-shots" && mkdir -p readme && bun readme.shoot.ts readme`
Depois, no repositório:

```bash
cd D:/Projetos/focusbrew
git rm -q docs/screenshots/*.png
cp "$LOCALAPPDATA/Temp/fb-shots/readme/"*.png docs/screenshots/
ls docs/screenshots
```

Expected: seis imagens. Abrir cada uma e conferir (barra parada colada no topo do "desktop"; caixa com a linha; Minimal; RGB; painel aberto com tarefas e a grade; configurações).

- [ ] **Step 2: README novo**

`README.md` (arquivo inteiro):

````markdown
# focusbrew

Um tracker do dia pra quem programa, num widget colado no topo da tela. Você
lista as tarefas, dá play em uma, e uma linha se enche em volta do widget
enquanto o tempo corre. Passou o mouse? Abre o painel com as tarefas de hoje e
a grade dos seus últimos 28 dias.

Feito com [Tauri](https://tauri.app) (Rust) + React/TypeScript. Windows.

<p align="center">
  <img src="docs/screenshots/widget-rodando.png" alt="Widget no topo da tela com a contagem e a tarefa" width="440">
</p>

## Como funciona

- **Parado:** uma barra reta e fina no topo da tela, sem nada dentro.
- **Rodando:** a barra vira uma caixa com a contagem regressiva à esquerda e o
  nome da tarefa à direita; uma linha em volta dela vai se enchendo. No modo
  **Minimal** só a caixa e a linha aparecem.
- **Passou o mouse:** depois de um instante, abre o painel — **To Do** à
  esquerda e **Activity** à direita. Quando o mouse sai, ele fecha.

<p align="center">
  <img src="docs/screenshots/widget-parado.png" alt="Barra parada" width="260">
  <img src="docs/screenshots/widget-minimal.png" alt="Modo minimal" width="260">
  <img src="docs/screenshots/widget-rgb.png" alt="Linha RGB" width="260">
</p>

### O painel

<p align="center">
  <img src="docs/screenshots/painel.png" alt="Painel To Do e Activity" width="560">
</p>

- Cada tarefa tem o **seu tempo** (de 5 a 180 minutos, de 5 em 5), um botão
  **play** e uma alça pra **arrastar** e reordenar. Passando o mouse na linha
  aparece um **×** pra remover.
- Só uma tarefa roda por vez. Dar play em outra encerra a primeira e guarda o
  tempo trabalhado; parar antes do fim, concluir ou fechar o app também guardam.
- Quando o tempo acaba, o Windows avisa ("Bloco concluído"). A tarefa continua
  aberta: quem marca como feita é você.
- **Activity** mostra as últimas 4 semanas, segunda a domingo; quanto mais
  foco no dia, mais forte o azul. Passe o mouse num quadrado pra ver a data e o
  tempo.
- Se o computador dormir, o tempo parado **não** conta.

**Atalho global:** `Ctrl+Shift+Space` pausa e retoma o bloco; com nada rodando,
inicia a primeira tarefa aberta.

## Configurações

Clique no ícone da bandeja (ou use **Abrir configurações** no menu dele).

<p align="center">
  <img src="docs/screenshots/configuracoes.png" alt="Janela de configurações" width="560">
</p>

| Seção | O que muda |
|---|---|
| **Foco** | minutos de uma tarefa nova; aviso quando o bloco termina |
| **Notch** | estilo Standard ou Minimal; linha de progresso; linha RGB; **cor de destaque**; tamanho (Pequeno, Médio, Grande) |
| **Geral** | mostrar ou esconder o widget; versão |
| **GitHub** | conectar pelo login do `gh` (ou um token) e importar PRs e issues como tarefas |

### GitHub

Se o [GitHub CLI](https://cli.github.com) estiver instalado e logado
(`gh auth login`), a aba GitHub mostra **Conectar com o GitHub CLI**, sem token
pra colar. Sem o `gh`, dá pra usar um Personal Access Token (guardado no cofre
de credenciais do Windows). A lista de PRs/issues atualiza ao abrir o app e a
cada 5 minutos; o botão **+ Tarefa** de cada item cria uma tarefa com o
repositório na nota.

## Instalação

Baixe o instalador mais recente em
[Releases](https://github.com/sthevan027/focusbrew/releases)
(`focusbrew_<versão>_x64-setup.exe`).

O instalador é de **um clique**: instala só pro usuário atual (sem pedir
admin), sem telas de assistente, cria atalhos na área de trabalho e no menu
Iniciar e abre o app ao terminar. A setinha no canto do ícone da área de
trabalho é o padrão do Windows pra qualquer atalho.

Se o SmartScreen avisar na primeira execução (o certificado é interno),
clique em **Mais informações → Executar assim mesmo**.

Pra desinstalar: **Configurações → Apps → Apps instalados → focusbrew**.

## Desenvolvimento

Pré-requisitos: [Rust](https://www.rust-lang.org/tools/install) + o Visual
Studio Build Tools com o workload "Desktop development with C++" (veja os
[pré-requisitos do Tauri](https://tauri.app/start/prerequisites/)) e Node.js 18+.

```bash
npm install
npm run tauri dev      # app em desenvolvimento
npm test               # contas do front-end (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # regras do timer, tarefas e configurações
npm run dist           # instalador em src-tauri/target/release/bundle/nsis/
npm run dist:signed    # o mesmo, assinado (certificado em src-tauri/tauri.signing.conf.json)
```

O instalador usa uma cópia do template NSIS do Tauri
(`src-tauri/windows/installer.nsi`, base `tauri-cli` 2.11.4) que força o modo
passivo; se atualizar o `@tauri-apps/cli`, compare com o template novo.

### Como o código está organizado

```
src-tauri/src/
  tracker/        o coração, sem Tauri: timer por horário final, tarefas, atividade por dia
  widget.rs       tamanho e posição da janela do widget (colada no topo do monitor)
  config.rs       configurações (lê qualquer arquivo, antigo ou quebrado, sem falhar)
  state.rs        o estado e o que a interface recebe
  commands.rs     os comandos que a interface chama
  github.rs       login pelo gh/token, PRs e issues, calendário de contribuições
  lib.rs          bandeja, atalho global, o relógio de 1 s, notificações
src/
  Widget.tsx      a janela do widget (barra, caixa, painel)
  widget/         Notch, ProgressLine, TodoPanel, TaskRow, ActivityGrid
  App.tsx         a janela de configurações
  settings/       as seções
  lib/            contas puras (linha de progresso, grade, reordenar) com testes
```

O backend guarda *qual tarefa está rodando* e *quando ela termina*; a interface
só desenha a partir desse horário, sem contar tempo por conta própria. Os
dados ficam em `%APPDATA%\sthevandev\focusbrew\` (`config\settings.json`,
`data\tasks.json`, `data\activity.json`).

## Licença

MIT.
````

- [ ] **Step 3: Versão 0.2.0**

```bash
cd D:/Projetos/focusbrew
npm pkg set version=0.2.0
sed -i 's/^version = "0.1.1"/version = "0.2.0"/' src-tauri/Cargo.toml
sed -i 's/"version": "0.1.1"/"version": "0.2.0"/' src-tauri/tauri.conf.json
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -2
grep -n '"version"' package.json src-tauri/tauri.conf.json; grep -n '^version' src-tauri/Cargo.toml; grep -n -A1 'name = "focusbrew"' src-tauri/Cargo.lock
```

Expected: as quatro ocorrências em `0.2.0`; `cargo check` termina sem erro (e atualiza o `Cargo.lock`).

- [ ] **Step 4: Verificação final antes do instalador**

Run: `cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | grep "test result"` — Expected: `0 failed` (87 testes).
Run: `npm test 2>&1 | tail -4 && npx tsc --noEmit && echo tsc-ok` — Expected: testes verdes e `tsc-ok`.
Run: `grep -rn "dnd_enabled\|blocked_apps\|focus_mode\|break_minutes\|TimerPhase" src src-tauri/src docs/superpowers/specs README.md | head` — Expected: nenhuma linha fora da própria spec e do plano (resto do foco antigo).

- [ ] **Step 5: Commit e PR**

```bash
git add -A README.md docs package.json package-lock.json src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "docs: README for the daily tracker; bump to 0.2.0" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat/daily-notch
gh pr create --base main --head feat/daily-notch --title "feat: focusbrew v0.2 — daily tracker no notch (etapa 1)" --body-file - <<'EOF'
## O que muda

O focusbrew deixa de ser um "modo foco" (detecção por processo, bloqueio de apps, Não Perturbe) e vira um **tracker do dia pra dev**, no estilo do DailyNotch. Especificação: `docs/superpowers/specs/2026-10-05-daily-notch-design.md`. Plano: `docs/superpowers/plans/2026-10-05-daily-notch.md`.

- **Widget colado no topo da tela:** parado é uma barra reta fina, sem nada; rodando vira uma caixa com a contagem e a tarefa (Standard) ou só a caixa (Minimal), com uma **linha de progresso** em volta (e modo RGB).
- **Painel ao passar o mouse:** To Do com timer por tarefa (minutos, play/pausa, arrastar, remover, "Add a task") e a grade **Activity** dos últimos 28 dias.
- **Timer no backend por horário final**, sem contar tempo na interface; o tempo do computador dormindo não conta; parar, concluir, remover ou fechar o app guardam o tempo trabalhado.
- **Configurações** com menu lateral: Foco, Notch (estilo, linha, RGB, cor de destaque, tamanho), Geral e GitHub.
- **Saiu:** detecção por processo, bloqueio de apps, Não Perturbe, pausa-café, ícones de xícara da bandeja.
- Arquivos antigos (`settings.json`, `tasks.json`, `activity.json`) continuam carregando; o histórico antigo de blocos não entra na grade nova.

## Como foi testado
- Rust: 87 testes (timer, tarefas, atividade por dia, configurações, layout do widget, GitHub).
- Front-end: `vitest` nas contas puras (linha de progresso, grade, reordenar, cores, minutos).
- App de verdade no Windows: barra colada no topo, abre e fecha com o mouse, linha enchendo, pausa pelo atalho, 150 apertos do atalho sem travar, configurações aplicando no widget, bloco de 5 minutos terminando com notificação.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

**Parar aqui e mostrar o PR ao Sthevan.** Não mesclar nem publicar sem o ok dele.

- [ ] **Step 6: Depois do ok — mesclar, gerar o instalador assinado, instalar e publicar**

```bash
cd D:/Projetos/focusbrew
gh pr merge --merge && git checkout main && git pull --ff-only
powershell -NoProfile -Command "Get-Process focusbrew -ErrorAction SilentlyContinue | Stop-Process -Force"
rm -f src-tauri/target/release/bundle/nsis/*.exe
npm run dist:signed 2>&1 | grep -E "^error|Finished 1 bundle|Successfully signed.*setup.exe"
```

```powershell
$i = "D:\Projetos\focusbrew\src-tauri\target\release\bundle\nsis\focusbrew_0.2.0_x64-setup.exe"
"installer signature: " + (Get-AuthenticodeSignature $i).Status + " | " + (Get-AuthenticodeSignature $i).SignerCertificate.Subject
$p = Start-Process $i -PassThru; $p.WaitForExit(120000) | Out-Null; "exit: $($p.ExitCode)"; Start-Sleep 5
$e = "$env:LOCALAPPDATA\focusbrew\focusbrew.exe"
"installed: " + (Get-AuthenticodeSignature $e).Status + " | version " + (Get-Item $e).VersionInfo.ProductVersion
"running: " + [bool](Get-Process focusbrew -ErrorAction SilentlyContinue)
```

Expected: assinatura `Valid | CN=Sthevan.Dev`; instalador sai com `0`; o app instalado `Valid`, versão `0.2.0`, rodando, e o widget aparece colado no topo da tela.

Então a tag e a release:

```bash
git tag -a v0.2.0 -m "focusbrew v0.2.0" main && git push -q origin v0.2.0
gh release create v0.2.0 "src-tauri/target/release/bundle/nsis/focusbrew_0.2.0_x64-setup.exe" --title "focusbrew v0.2.0" --notes-file - <<'EOF'
O focusbrew virou um **tracker do dia pra dev**, num widget colado no topo da tela.

### Novo
- **Widget no topo:** parado é uma barra fina; rodando vira uma caixa com a contagem e a tarefa, com uma **linha de progresso** em volta (modos Standard e Minimal, e linha RGB).
- **Painel ao passar o mouse:** tarefas do dia, cada uma com o **seu timer** (minutos, play/pausa, arrastar pra reordenar), e a grade **Activity** dos últimos 28 dias.
- **Configurações** com menu lateral: Foco, Notch (estilo, linha, RGB, **cor de destaque**, tamanho), Geral e GitHub.
- O tempo trabalhado é guardado ao parar, concluir, remover a tarefa ou fechar o app; o computador dormindo não conta.

### Saiu
Detecção por processo, bloqueio de apps, Não Perturbe e a pausa-café.

### Atenção
O histórico antigo de blocos de foco não aparece na grade nova. Suas tarefas e configurações continuam.

Assinado com o certificado interno **Sthevan.Dev**. O SmartScreen mostra editor "desconhecido" até a Root CA `Sthevan.Dev Root CA` ser marcada como confiável; se aparecer o aviso, clique em **Mais informações → Executar assim mesmo**.
EOF
gh release list --limit 2
gh release view v0.2.0 --json assets --jq '.assets[] | .name+" "+(.size|tostring)'
```

Expected: `focusbrew v0.2.0  Latest`; o ativo `focusbrew_0.2.0_x64-setup.exe` com o mesmo tamanho do arquivo local.

- [ ] **Step 7: Vault e limpeza**

Registrar a sessão no vault (nota em `1-Projetos/focusbrew/` com o título `Etapa 1 do daily tracker no notch - implementada e publicada (AAAA-MM-DD)` e a linha no `focusbrew.md`): o que foi entregue, o PR, a release, o que mudou em relação à spec (as decisões do topo do plano) e o que fica pras etapas 2 a 4. Apagar `%LOCALAPPDATA%\Temp\fb-shots` e `%LOCALAPPDATA%\Temp\fb-e2e` (e a cópia de segurança, depois de confirmar que o app instalado abriu com as tarefas do Sthevan). Limpezas que ele já sabe: `git stash drop` (thumbprint antigo) e os branches locais já mesclados.
