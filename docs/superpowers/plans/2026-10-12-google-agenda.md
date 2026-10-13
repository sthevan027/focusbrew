# Sincronização com o Google Agenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O FocusBrew conecta a conta Google do usuário e sincroniza tarefas com o Google Agenda nos dois sentidos: o usuário escolhe, evento a evento, quais eventos do dia entram como tarefa; toda tarefa manual criada no app nasce como evento na Agenda; concluir/editar/excluir em qualquer lado se reflete no outro em poucos minutos.

**Architecture:** Novo módulo Rust `google_calendar.rs` (espelha a forma de `github.rs`: OAuth via PKCE + `keyring`, chamadas HTTP com `reqwest`). `Task` ganha `google_event_id` e `updated_at`; `TaskSource` ganha a variante `GoogleCalendar`. Um loop de fundo (`spawn_google_sync_loop`, no estilo de `spawn_github_refresh_loop`) cria eventos pras tarefas manuais novas e aplica a regra "edição mais recente vence" nos dois sentidos a cada 5 min. O frontend ganha uma aba "Agenda" com checkboxes pra importar eventos do dia.

**Tech Stack:** Rust (Tauri v2, `reqwest`, `keyring`, `chrono`, `serde`), React + TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-google-agenda-design.md`

## Global Constraints

- Escopo OAuth: só `https://www.googleapis.com/auth/calendar.events` — sem acesso a outros dados do Google.
- Só o calendário `primary` do usuário; sem suporte a múltiplos calendários (fora de escopo da spec).
- Conclusão de tarefa no Google Agenda é representada como prefixo `"✓ "` no título do evento (Calendar não tem campo de conclusão nativo) — ver seção 1 da spec.
- Conflito de edição: a edição com `updated_at`/`updated` mais recente vence, sem merge fino (seção 5 da spec).
- Falha de rede em qualquer chamada nunca trava a UI nem perde a tarefa local — só fica pendente pro próximo ciclo (seção 4 da spec).
- Refresh token fica só no `keyring` (serviço `focusbrew`, conta `google-refresh-token`); nunca em `settings.json`.

## Review Focus

- **Token expirado durante um ciclo de sync:** o `access_token` expira (Google dá ~1h); o ciclo deve renovar via `refresh_token` sozinho, sem exigir reconectar.
- **Evento sem horário de término** (evento de dia inteiro, só `date` em vez de `dateTime` no JSON do Google): `parse_events_response` não pode entrar em pânico nem descartar o evento inteiro.
- **Usuário desconecta a conta Google com uma tarefa importada ainda aberta:** a tarefa local deve continuar existindo (só para de sincronizar), nunca ser apagada por desconectar.
- **`remove_task` numa tarefa sem `google_event_id`** (tarefa manual nunca sincronizada, ou tarefa do GitHub): não deve tentar nenhuma chamada ao Google, nem travar esperando rede.
- **Evento criado e apagado no Google antes do próximo ciclo de sync** (tarefa local com `google_event_id` que já não existe mais): a resposta 404 do Google deve remover a tarefa local, não ficar tentando de novo pra sempre nem gerar erro visível repetido.

---

### Task 1: `Task` ganha `google_event_id` e `updated_at`

**Files:**
- Modify: `src-tauri/src/tracker/tasks.rs` (struct `Task`, enum `TaskSource`, `fn new_task`)
- Modify: `src-tauri/src/tracker/mod.rs` (`edit_task`, `toggle_task`, `move_task`, `set_minutes`)
- Test: `src-tauri/src/tracker/tasks.rs` (mod `tests` existente), `src-tauri/src/tracker/mod.rs` (mod `tests` existente)

**Interfaces:**
- Produces: `Task.google_event_id: Option<String>`, `Task.updated_at: i64` (epoch ms), `TaskSource::GoogleCalendar` (serde `"google_calendar"`).

- [ ] **Step 1: Escreva os testes que falham**

Em `src-tauri/src/tracker/tasks.rs`, dentro do `mod tests` já existente:

```rust
#[test]
fn new_task_starts_with_no_google_event_and_a_fresh_timestamp() {
    let before = chrono::Utc::now().timestamp_millis();
    let task = new_task("Título", TaskSource::Manual, 25, "2026-10-12").unwrap();
    assert_eq!(task.google_event_id, None);
    assert!(task.updated_at >= before);
}

#[test]
fn google_calendar_source_round_trips_through_json() {
    let raw = r#"{"id":"1","title":"Reunião","done":false,"created_at":"2026-10-12T10:00:00Z",
                   "source":"google_calendar","day":"2026-10-12"}"#;
    let task: Task = serde_json::from_str(raw).unwrap();
    assert_eq!(task.source, TaskSource::GoogleCalendar);
    assert_eq!(task.google_event_id, None); // default quando o campo falta no JSON antigo
    assert_eq!(task.updated_at, 0); // default quando o campo falta no JSON antigo
}
```

Em `src-tauri/src/tracker/mod.rs`, dentro do `mod tests` já existente:

```rust
#[test]
fn edit_task_bumps_updated_at() {
    let mut tracker = tracker_with_one_task();
    let id = tracker.tasks[0].id.clone();
    tracker.tasks[0].updated_at = 1_000;
    tracker.edit_task(&id, "Novo título").unwrap();
    assert!(tracker.tasks[0].updated_at > 1_000);
}

#[test]
fn toggle_task_bumps_updated_at() {
    let mut tracker = tracker_with_one_task();
    let id = tracker.tasks[0].id.clone();
    tracker.tasks[0].updated_at = 1_000;
    tracker.toggle_task(&id, 2_000_000, "2026-10-12");
    assert_eq!(tracker.tasks[0].updated_at, 2_000_000);
}

#[test]
fn move_task_bumps_updated_at() {
    let mut tracker = tracker_with_one_task();
    let id = tracker.tasks[0].id.clone();
    tracker.tasks[0].updated_at = 1_000;
    tracker.move_task(&id, "2026-10-13").unwrap();
    assert!(tracker.tasks[0].updated_at > 1_000);
}
```

Se o arquivo `mod.rs` ainda não tiver um helper `tracker_with_one_task()` nos testes, adicione-o junto (cria um `Tracker` com uma única tarefa manual "x", 25 min, dia "2026-10-12" — siga o padrão dos outros helpers de teste já existentes no arquivo, como `connected()` em `state.rs`).

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `cd src-tauri && cargo test tasks:: mod::`
Expected: FAIL — `google_event_id`/`updated_at` não existem ainda em `Task`/`TaskSource::GoogleCalendar`.

- [ ] **Step 3: Implemente**

Em `tasks.rs`:

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskSource {
    Manual,
    Github,
    #[serde(rename = "google_calendar")]
    GoogleCalendar,
}
```

```rust
pub struct Task {
    // ... campos existentes ...
    /// O evento correspondente na Google Agenda, se já sincronizado.
    #[serde(default)]
    pub google_event_id: Option<String>,
    /// Quando a tarefa foi editada por último (epoch ms) — decide quem
    /// vence ao sincronizar com o Google ("edição mais recente vence").
    #[serde(default)]
    pub updated_at: i64,
}
```

Em `new_task`, inicialize os dois campos novos (`google_event_id: None`, `updated_at: chrono::Utc::now().timestamp_millis()`).

Em `mod.rs`, em `edit_task`, `move_task` e `toggle_task`, depois de mutar a tarefa, defina `task.updated_at = now_ms` (em `edit_task`/`move_task`, que não recebem `now_ms` hoje, adicione o parâmetro `now_ms: i64` e atualize as chamadas em `commands.rs` — `apply()` já fornece `now_ms` ao closure). Em `set_minutes`, idem.

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `cd src-tauri && cargo test tasks:: mod::`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tracker/tasks.rs src-tauri/src/tracker/mod.rs src-tauri/src/commands.rs
git commit -m "feat: Task ganha google_event_id e updated_at"
```

---

### Task 2: OAuth — PKCE, URL de autorização e callback local

**Files:**
- Create: `src-tauri/src/google_calendar.rs`
- Modify: `src-tauri/src/lib.rs` (`mod google_calendar;`)
- Test: `src-tauri/src/google_calendar.rs` (`mod tests`)

**Interfaces:**
- Produces: `PkcePair { verifier: String, challenge: String }`, `generate_pkce() -> PkcePair`, `authorize_url(challenge: &str, redirect_uri: &str, client_id: &str) -> String`, `extract_code_from_request_line(line: &str) -> Option<String>`, `listen_for_code(port: u16) -> Result<String, String>`.

- [ ] **Step 1: Escreva os testes que falham**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_the_sha256_of_the_verifier_base64url() {
        let pair = generate_pkce();
        assert_eq!(pair.verifier.len(), 64);
        // A mesma verifier sempre produz o mesmo challenge (determinístico).
        let challenge_again = challenge_from_verifier(&pair.verifier);
        assert_eq!(pair.challenge, challenge_again);
        assert!(!pair.challenge.contains('+'));
        assert!(!pair.challenge.contains('/'));
        assert!(!pair.challenge.contains('='));
    }

    #[test]
    fn authorize_url_has_the_required_query_params() {
        let url = authorize_url("chal123", "http://127.0.0.1:53682/callback", "client-id.apps.googleusercontent.com");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        assert!(url.contains("client_id=client-id.apps.googleusercontent.com"));
        assert!(url.contains("code_challenge=chal123"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback"));
        assert!(url.contains("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events"));
    }

    #[test]
    fn extracts_the_code_from_a_real_browser_redirect_request_line() {
        let line = "GET /callback?code=4%2F0AX4XfWi&scope=... HTTP/1.1";
        assert_eq!(extract_code_from_request_line(line), Some("4/0AX4XfWi".to_string()));
    }

    #[test]
    fn a_denied_authorization_has_no_code() {
        let line = "GET /callback?error=access_denied HTTP/1.1";
        assert_eq!(extract_code_from_request_line(line), None);
    }

    #[test]
    fn garbage_request_line_has_no_code() {
        assert_eq!(extract_code_from_request_line(""), None);
        assert_eq!(extract_code_from_request_line("not a request"), None);
    }
}
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `cd src-tauri && cargo test google_calendar::`
Expected: FAIL com "cannot find function" para todas as funções (módulo ainda não existe).

- [ ] **Step 3: Implemente**

```rust
//! Sincronização de tarefas com o Google Agenda: OAuth (PKCE, sem client
//! secret fixo), leitura/escrita de eventos e a regra de "edição mais
//! recente vence" ao conciliar os dois lados.

use rand::RngCore;
use sha2::{Digest, Sha256};

const SERVICE: &str = "focusbrew";
const ACCOUNT: &str = "google-refresh-token";

pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

fn base64url(bytes: &[u8]) -> String {
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, bytes)
}

fn challenge_from_verifier(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64url(&digest)
}

/// Um par verifier/challenge novo pra cada tentativa de login (RFC 7636).
pub fn generate_pkce() -> PkcePair {
    let mut bytes = [0u8; 48];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = base64url(&bytes);
    let challenge = challenge_from_verifier(&verifier);
    PkcePair { verifier, challenge }
}

/// A URL que o navegador abre pra autorizar o FocusBrew.
pub fn authorize_url(challenge: &str, redirect_uri: &str, client_id: &str) -> String {
    let encoded_redirect = urlencoding::encode(redirect_uri);
    let encoded_scope = urlencoding::encode("https://www.googleapis.com/auth/calendar.events");
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
         client_id={client_id}&redirect_uri={encoded_redirect}&response_type=code&\
         scope={encoded_scope}&code_challenge={challenge}&code_challenge_method=S256&\
         access_type=offline&prompt=consent"
    )
}

/// A primeira linha de uma requisição HTTP real do navegador parece
/// `GET /callback?code=...&scope=... HTTP/1.1`. `None` quando não tem
/// `code` (usuário negou, ou a linha não é uma requisição de verdade).
pub fn extract_code_from_request_line(line: &str) -> Option<String> {
    let path = line.strip_prefix("GET ")?.split(' ').next()?;
    let query = path.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("code=") {
            return urlencoding::decode(value).ok().map(|c| c.into_owned());
        }
    }
    None
}

/// Escuta uma única conexão em `127.0.0.1:{port}`, lê a primeira linha da
/// requisição do redirect do Google, responde com uma página simples de
/// "pode fechar essa aba" e devolve o código (ou erro se a porta já está
/// ocupada, a conexão cair, ou a página pedida não tiver `code`).
pub fn listen_for_code(port: u16) -> Result<String, String> {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line).map_err(|e| e.to_string())?;

    let code = extract_code_from_request_line(request_line.trim_end());
    let body = "<html><body>Pode fechar essa aba e voltar pro FocusBrew.</body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());

    code.ok_or_else(|| "autorização negada ou sem código no redirect".to_string())
}
```

Adicione `mod google_calendar;` em `lib.rs` junto dos outros `mod`. Adicione `rand`, `sha2` e `urlencoding` ao `[dependencies]` de `src-tauri/Cargo.toml` (versões estáveis mais recentes no momento do build — confira `cargo add rand sha2 urlencoding` em vez de copiar um número fixo aqui).

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `cd src-tauri && cargo test google_calendar::`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/google_calendar.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: PKCE, URL de autorização e callback local do Google OAuth"
```

---

### Task 3: Troca de código por token e parsing da resposta de eventos

**Files:**
- Modify: `src-tauri/src/google_calendar.rs`

**Interfaces:**
- Consumes: `PkcePair` (Task 2).
- Produces: `TokenResponse { access_token: String, refresh_token: Option<String>, expires_in: u64 }`, `async fn exchange_code(code: &str, verifier: &str, redirect_uri: &str, client_id: &str) -> Result<TokenResponse, String>`, `async fn refresh_access_token(refresh_token: &str, client_id: &str) -> Result<TokenResponse, String>`, `CalendarEvent { id: String, title: String, start_ms: i64, end_ms: i64, updated_ms: i64 }`, `fn parse_events_response(raw: &str) -> Result<Vec<CalendarEvent>, String>`.

- [ ] **Step 1: Escreva os testes que falham**

```rust
#[test]
fn parses_a_timed_event() {
    let raw = r#"{"items":[{
        "id":"abc123","summary":"Reunião",
        "start":{"dateTime":"2026-10-12T14:00:00-03:00"},
        "end":{"dateTime":"2026-10-12T15:00:00-03:00"},
        "updated":"2026-10-10T09:00:00.000Z"
    }]}"#;
    let events = parse_events_response(raw).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "abc123");
    assert_eq!(events[0].title, "Reunião");
    assert!(events[0].start_ms < events[0].end_ms);
}

#[test]
fn an_all_day_event_has_no_time_of_day_but_still_parses() {
    let raw = r#"{"items":[{
        "id":"xyz","summary":"Feriado",
        "start":{"date":"2026-10-12"},
        "end":{"date":"2026-10-13"},
        "updated":"2026-10-01T00:00:00.000Z"
    }]}"#;
    let events = parse_events_response(raw).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].title, "Feriado");
}

#[test]
fn an_event_without_summary_falls_back_to_a_placeholder_title() {
    let raw = r#"{"items":[{
        "id":"noname",
        "start":{"dateTime":"2026-10-12T14:00:00-03:00"},
        "end":{"dateTime":"2026-10-12T15:00:00-03:00"},
        "updated":"2026-10-10T09:00:00.000Z"
    }]}"#;
    let events = parse_events_response(raw).unwrap();
    assert_eq!(events[0].title, "(sem título)");
}

#[test]
fn an_empty_list_is_not_an_error() {
    assert_eq!(parse_events_response(r#"{"items":[]}"#).unwrap(), vec![]);
}

#[test]
fn garbage_json_is_an_error_not_a_panic() {
    assert!(parse_events_response("not json").is_err());
}
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `cd src-tauri && cargo test google_calendar::`
Expected: FAIL — `CalendarEvent`/`parse_events_response` não existem.

- [ ] **Step 3: Implemente**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
}

fn client() -> reqwest::Client {
    reqwest::Client::new()
}

pub async fn exchange_code(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
    client_id: &str,
) -> Result<TokenResponse, String> {
    let resp = client()
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Google rejeitou o código (HTTP {})", resp.status()));
    }
    resp.json().await.map_err(|e| e.to_string())
}

pub async fn refresh_access_token(refresh_token: &str, client_id: &str) -> Result<TokenResponse, String> {
    let resp = client()
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh_token),
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("falha ao renovar o token (HTTP {})", resp.status()));
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub updated_ms: i64,
}

#[derive(Debug, Deserialize)]
struct EventsResponse {
    #[serde(default)]
    items: Vec<RawEvent>,
}

#[derive(Debug, Deserialize)]
struct RawEvent {
    id: String,
    summary: Option<String>,
    start: RawWhen,
    end: RawWhen,
    updated: String,
}

#[derive(Debug, Deserialize)]
struct RawWhen {
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
    date: Option<String>,
}

fn when_to_ms(when: &RawWhen) -> Option<i64> {
    if let Some(dt) = &when.date_time {
        return chrono::DateTime::parse_from_rfc3339(dt).ok().map(|d| d.timestamp_millis());
    }
    if let Some(d) = &when.date {
        return chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
            .ok()
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .map(|dt| dt.and_utc().timestamp_millis());
    }
    None
}

/// Converte a resposta de `events.list` em `CalendarEvent`s. Um evento sem
/// horário de início/fim reconhecível é descartado (não derruba os outros).
pub fn parse_events_response(raw: &str) -> Result<Vec<CalendarEvent>, String> {
    let parsed: EventsResponse = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    Ok(parsed
        .items
        .into_iter()
        .filter_map(|e| {
            let start_ms = when_to_ms(&e.start)?;
            let end_ms = when_to_ms(&e.end)?;
            let updated_ms = chrono::DateTime::parse_from_rfc3339(&e.updated).ok()?.timestamp_millis();
            Some(CalendarEvent {
                id: e.id,
                title: e.summary.unwrap_or_else(|| "(sem título)".to_string()),
                start_ms,
                end_ms,
                updated_ms,
            })
        })
        .collect())
}
```

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `cd src-tauri && cargo test google_calendar::`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/google_calendar.rs
git commit -m "feat: troca de código por token e parsing de eventos do Calendar"
```

---

### Task 4: Helpers de conclusão (prefixo "✓ ") e de conflito

**Files:**
- Modify: `src-tauri/src/google_calendar.rs`

**Interfaces:**
- Produces: `fn done_title(original: &str) -> String`, `fn strip_done_prefix(title: &str) -> (String, bool)`, `enum Winner { Local, Remote }`, `fn newer_wins(local_updated_ms: i64, remote_updated_ms: i64) -> Winner`.

- [ ] **Step 1: Escreva os testes que falham**

```rust
#[test]
fn done_title_adds_the_checkmark_prefix() {
    assert_eq!(done_title("Reunião"), "✓ Reunião");
}

#[test]
fn strip_done_prefix_recognizes_the_checkmark() {
    assert_eq!(strip_done_prefix("✓ Reunião"), ("Reunião".to_string(), true));
}

#[test]
fn strip_done_prefix_on_a_plain_title_is_a_no_op() {
    assert_eq!(strip_done_prefix("Reunião"), ("Reunião".to_string(), false));
}

#[test]
fn stripping_then_redoing_the_prefix_round_trips() {
    let (plain, _) = strip_done_prefix("✓ Reunião");
    assert_eq!(done_title(&plain), "✓ Reunião");
}

#[test]
fn newer_wins_picks_the_larger_timestamp() {
    assert_eq!(newer_wins(100, 50), Winner::Local);
    assert_eq!(newer_wins(50, 100), Winner::Remote);
}

#[test]
fn a_tie_favors_the_remote_so_a_fresh_pull_does_not_fight_a_stale_local_default() {
    assert_eq!(newer_wins(100, 100), Winner::Remote);
}
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `cd src-tauri && cargo test google_calendar::`
Expected: FAIL — funções não existem.

- [ ] **Step 3: Implemente**

```rust
const DONE_PREFIX: &str = "✓ ";

pub fn done_title(original: &str) -> String {
    format!("{DONE_PREFIX}{original}")
}

/// `(título sem o prefixo, estava marcado como concluído)`.
pub fn strip_done_prefix(title: &str) -> (String, bool) {
    match title.strip_prefix(DONE_PREFIX) {
        Some(rest) => (rest.to_string(), true),
        None => (title.to_string(), false),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Winner {
    Local,
    Remote,
}

/// Quem vence ao conciliar uma tarefa editada nos dois lados. Um empate
/// favorece o remoto: `updated_at` local começa em 0 pra tarefas antigas
/// sem esse campo, e um evento recém-puxado não deve perder pra esse
/// default.
pub fn newer_wins(local_updated_ms: i64, remote_updated_ms: i64) -> Winner {
    if local_updated_ms > remote_updated_ms {
        Winner::Local
    } else {
        Winner::Remote
    }
}
```

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `cd src-tauri && cargo test google_calendar::`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/google_calendar.rs
git commit -m "feat: prefixo de conclusão e regra de conflito do sync"
```

---

### Task 5: Criar, renomear e excluir eventos na Agenda

**Files:**
- Modify: `src-tauri/src/google_calendar.rs`

**Interfaces:**
- Consumes: `CalendarEvent`, `client()` (Task 3).
- Produces: `async fn create_event(access_token: &str, title: &str, start_ms: i64, end_ms: i64) -> Result<String, String>` (retorna o `id` do evento criado), `async fn patch_event_title(access_token: &str, event_id: &str, title: &str) -> Result<(), String>`, `async fn delete_event(access_token: &str, event_id: &str) -> Result<DeleteOutcome, String>`, `enum DeleteOutcome { Deleted, AlreadyGone }`.

- [ ] **Step 1: Escreva os testes que falham**

Essas três funções fazem chamadas de rede reais — sem fixture de servidor nesta base de código (veja `github.rs`: funções de rede não têm teste unitário próprio, só os parsers puros). O teste aqui cobre a única parte pura: o corpo JSON que `create_event`/`patch_event_title` montam.

```rust
#[test]
fn event_body_uses_rfc3339_with_the_right_shape() {
    // 2026-10-12T14:00:00-03:00 em epoch ms.
    let start_ms = 1_760_284_800_000i64;
    let end_ms = start_ms + 3_600_000;
    let body = event_body("Estudar Rust", start_ms, end_ms);
    assert_eq!(body["summary"], "Estudar Rust");
    assert!(body["start"]["dateTime"].as_str().unwrap().contains('T'));
    assert!(body["end"]["dateTime"].as_str().unwrap().contains('T'));
}
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `cd src-tauri && cargo test google_calendar::event_body`
Expected: FAIL — `event_body` não existe.

- [ ] **Step 3: Implemente**

```rust
fn event_body(title: &str, start_ms: i64, end_ms: i64) -> serde_json::Value {
    let start = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(start_ms).unwrap_or_default();
    let end = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(end_ms).unwrap_or_default();
    serde_json::json!({
        "summary": title,
        "start": { "dateTime": start.to_rfc3339() },
        "end": { "dateTime": end.to_rfc3339() },
    })
}

fn auth_client(access_token: &str) -> Result<reqwest::Client, String> {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {access_token}")).map_err(|e| e.to_string())?,
    );
    reqwest::Client::builder().default_headers(headers).build().map_err(|e| e.to_string())
}

const EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

pub async fn create_event(access_token: &str, title: &str, start_ms: i64, end_ms: i64) -> Result<String, String> {
    let resp = auth_client(access_token)?
        .post(EVENTS_URL)
        .json(&event_body(title, start_ms, end_ms))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("falha ao criar evento (HTTP {})", resp.status()));
    }
    let created: CalendarEvent = resp.json().await.map_err(|e| e.to_string())?;
    Ok(created.id)
}

pub async fn patch_event_title(access_token: &str, event_id: &str, title: &str) -> Result<(), String> {
    let resp = auth_client(access_token)?
        .patch(format!("{EVENTS_URL}/{event_id}"))
        .json(&serde_json::json!({ "summary": title }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("falha ao editar evento (HTTP {})", resp.status()));
    }
    Ok(())
}

pub enum DeleteOutcome {
    Deleted,
    AlreadyGone,
}

pub async fn delete_event(access_token: &str, event_id: &str) -> Result<DeleteOutcome, String> {
    let resp = auth_client(access_token)?
        .delete(format!("{EVENTS_URL}/{event_id}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    match resp.status().as_u16() {
        200..=299 => Ok(DeleteOutcome::Deleted),
        404 | 410 => Ok(DeleteOutcome::AlreadyGone),
        code => Err(format!("falha ao excluir evento (HTTP {code})")),
    }
}
```

`create_event` precisa que a resposta do Google traga o `id` do evento criado — a struct `CalendarEvent` (Task 3) já tem esse campo; adicione `#[derive(Deserialize)]` nela se ainda não tiver (ela já deriva `Serialize, Deserialize` na Task 3).

- [ ] **Step 4: Rode o teste e confirme que passa**

Run: `cd src-tauri && cargo test google_calendar::event_body`
Expected: PASS

- [ ] **Step 5: Compile tudo e confirme que não quebrou nada**

Run: `cd src-tauri && cargo build`
Expected: compila sem erros (as funções de rede novas não têm teste de integração, só precisam compilar certo).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/google_calendar.rs
git commit -m "feat: criar, renomear e excluir eventos na Agenda"
```

---

### Task 6: Estado da conta Google e comandos conectar/desconectar

**Files:**
- Modify: `src-tauri/src/config.rs` (`AppConfig`)
- Modify: `src-tauri/src/state.rs` (`AppState`, `StateSnapshot`)
- Modify: `src-tauri/src/commands.rs` (novos comandos)
- Modify: `src-tauri/src/lib.rs` (registra os comandos, porta fixa do callback)
- Test: `src-tauri/src/state.rs` (mod `tests` existente)

**Interfaces:**
- Consumes: `google_calendar::{generate_pkce, authorize_url, listen_for_code, exchange_code, refresh_access_token, save_refresh_token, load_refresh_token, clear_refresh_token}` (Tasks 2–3; `save_refresh_token`/`load_refresh_token`/`clear_refresh_token` seguem o padrão de `github::save_token`/`load_token`/`clear_token` — adicione-as em `google_calendar.rs` nesta task, copiando a forma de `github.rs` linha a linha, troca só `SERVICE`/`ACCOUNT`).
- Produces: `AppConfig.google_connected: bool`, `AppState.google_access_token: Option<String>` (em memória, nunca salvo em disco), `AppState.google_error: Option<String>`, `AppState.google_last_sync_ms: i64`, `StateSnapshot.google_connected/google_error/google_last_sync_ms`, comandos Tauri `google_connect`, `google_disconnect`.

- [ ] **Step 1: Escreva o teste que falha**

Em `src-tauri/src/state.rs`, no `mod tests` existente:

```rust
#[test]
fn disconnecting_google_clears_the_in_memory_token_and_error() {
    let mut state = AppState::for_test();
    state.config.google_connected = true;
    state.google_access_token = Some("tok".to_string());
    state.google_error = Some("algo deu errado antes".to_string());
    state.disconnect_google();
    assert!(!state.config.google_connected);
    assert_eq!(state.google_access_token, None);
    assert_eq!(state.google_error, None);
}
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `cd src-tauri && cargo test state::disconnecting_google`
Expected: FAIL — `google_connected`/`disconnect_google` não existem.

- [ ] **Step 3: Implemente**

Em `google_calendar.rs`, copiando a forma de `github::save_token`/`load_token`/`clear_token`:

```rust
pub fn save_refresh_token(token: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

pub fn load_refresh_token() -> Option<String> {
    keyring::Entry::new(SERVICE, ACCOUNT).ok().and_then(|entry| entry.get_password().ok())
}

pub fn clear_refresh_token() -> Result<(), String> {
    match keyring::Entry::new(SERVICE, ACCOUNT) {
        Ok(entry) => entry.delete_credential().map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}
```

Em `config.rs`, adicione ao `AppConfig`: `pub google_connected: bool` (default `false`, como os outros booleanos do struct).

Em `state.rs`:

```rust
pub struct AppState {
    // ... campos existentes ...
    /// O access token da sessão Google atual; nunca persiste em disco (só
    /// o refresh token, no keyring — ver `google_calendar::save_refresh_token`).
    pub google_access_token: Option<String>,
    pub google_error: Option<String>,
    /// Epoch ms da última sincronização bem-sucedida (0 = nunca).
    pub google_last_sync_ms: i64,
}
```

Inicialize os três campos novos em `AppState::load()` e em `AppState::for_test()` (`None`, `None`, `0`).

```rust
impl AppState {
    pub fn disconnect_google(&mut self) {
        self.config.google_connected = false;
        self.google_access_token = None;
        self.google_error = None;
    }
}
```

Adicione `google_connected`, `google_error`, `google_last_sync_ms` à `StateSnapshot` e ao `impl From<&AppState> for StateSnapshot` (copiando os valores de `state.config.google_connected`, `state.google_error.clone()`, `state.google_last_sync_ms`).

Em `commands.rs`:

```rust
use crate::google_calendar;

/// Porta fixa pro callback local do OAuth — registrada como redirect URI
/// autorizado no projeto do Google Cloud.
const GOOGLE_OAUTH_PORT: u16 = 53682;
const GOOGLE_CLIENT_ID: &str = "COLOQUE_O_CLIENT_ID_AQUI.apps.googleusercontent.com";

#[tauri::command]
pub async fn google_connect(app: AppHandle, shared: State<'_, Shared>) -> Result<StateSnapshot, String> {
    let redirect_uri = format!("http://127.0.0.1:{GOOGLE_OAUTH_PORT}/callback");
    let pair = google_calendar::generate_pkce();
    let url = google_calendar::authorize_url(&pair.challenge, &redirect_uri, GOOGLE_CLIENT_ID);
    // Abre o navegador padrão do sistema; o callback local escuta em paralelo.
    let _ = tauri_plugin_opener::open_url(&url, None::<&str>);
    let code = tauri::async_runtime::spawn_blocking(move || google_calendar::listen_for_code(GOOGLE_OAUTH_PORT))
        .await
        .map_err(|e| e.to_string())??;
    let tokens = google_calendar::exchange_code(&code, &pair.verifier, &redirect_uri, GOOGLE_CLIENT_ID).await?;
    let refresh_token = tokens.refresh_token.ok_or_else(|| "Google não devolveu um refresh token".to_string())?;
    google_calendar::save_refresh_token(&refresh_token)?;

    let mut state = shared.lock();
    state.config.google_connected = true;
    state.google_access_token = Some(tokens.access_token);
    state.google_error = None;
    config::save(&state.config);
    let snapshot = StateSnapshot::from(&*state);
    drop(state);
    sync_ui(&app, &shared.lock());
    Ok(snapshot)
}

#[tauri::command]
pub fn google_disconnect(app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let _ = google_calendar::clear_refresh_token();
    let mut state = shared.lock();
    state.disconnect_google();
    config::save(&state.config);
    let snapshot = StateSnapshot::from(&*state);
    drop(state);
    sync_ui(&app, &shared.lock());
    snapshot
}
```

Ajuste a chamada a `config::save`/`sync_ui` pra bater com o padrão real já usado pelos outros comandos do arquivo (veja `save_github_token`/`clear_github_token` por perto — copie a forma exata deles em vez da reconstruída acima se diferir). Se o projeto ainda não tiver `tauri-plugin-opener`, use em vez disso o helper que o GitHub já usa indiretamente (confira se `webbrowser` ou `open` já é dependência; se não, adicione `cargo add tauri-plugin-opener` e registre o plugin em `lib.rs` junto dos outros `.plugin(...)`).

Registre `google_connect` e `google_disconnect` na lista `generate_handler![...]` em `lib.rs`.

- [ ] **Step 4: Rode o teste e confirme que passa**

Run: `cd src-tauri && cargo test state::disconnecting_google`
Expected: PASS

- [ ] **Step 5: Compile tudo**

Run: `cd src-tauri && cargo build`
Expected: compila sem erros.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/google_calendar.rs src-tauri/src/config.rs src-tauri/src/state.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: comandos google_connect/google_disconnect e estado da conta"
```

---

### Task 7: Puxar eventos do dia e importar como tarefa

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (registra os comandos)
- Create: `src/widget/AgendaTab.tsx`
- Modify: `src/lib/types.ts` (`Task.google_event_id`, `Task.updated_at`, `TaskSource` ganha `"google_calendar"`, `AppConfig.google_connected`, `StateSnapshot` ganha os 3 campos de `google_*`, novo `CalendarEventView`)
- Test: `src/widget/AgendaTab.test.tsx` (ou `src/lib/agenda.test.ts` se a lógica for extraída pura)

**Interfaces:**
- Consumes: `google_calendar::fetch_day_events`? — não existe ainda; esta task adiciona `pub async fn fetch_day_events(access_token: &str, day: &str) -> Result<Vec<CalendarEvent>, String>` em `google_calendar.rs` (usa `parse_events_response` da Task 3, filtrando `timeMin`/`timeMax` do dia).
- Produces: comandos Tauri `google_list_day_events(day: String) -> Result<Vec<CalendarEvent>, String>` e `google_import_event(event: CalendarEvent, day: String, minutes: u32) -> Result<StateSnapshot, String>`; função pura TS `isImported(eventId: string, tasks: Task[]): boolean`.

- [ ] **Step 1: Escreva o teste que falha (frontend, lógica pura)**

Crie `src/lib/agenda.ts` com a assinatura abaixo e `src/lib/agenda.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isImported } from "./agenda";
import type { Task } from "./types";

const task = (over: Partial<Task> = {}): Task => ({
  id: "1", title: "x", note: null, minutes: 25, done: false, created_at: "",
  source: "manual", spent_secs: 0, day: "2026-10-12", done_at: null,
  project: null, url: null, google_event_id: null,
  ...over,
});

describe("isImported", () => {
  it("is true when some task already points at that event", () => {
    const tasks = [task({ google_event_id: "evt-1" })];
    expect(isImported("evt-1", tasks)).toBe(true);
  });

  it("is false when no task points at that event", () => {
    const tasks = [task({ google_event_id: "evt-1" })];
    expect(isImported("evt-2", tasks)).toBe(false);
  });

  it("is false when nothing is imported yet", () => {
    expect(isImported("evt-1", [])).toBe(false);
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `bun test src/lib/agenda.test.ts`
Expected: FAIL — `src/lib/agenda.ts` não existe.

- [ ] **Step 3: Implemente**

`src/lib/agenda.ts`:

```ts
import type { Task } from "./types";

export function isImported(eventId: string, tasks: Task[]): boolean {
  return tasks.some((t) => t.google_event_id === eventId);
}
```

Em `src/lib/types.ts`:

```ts
export type TaskSource = "manual" | "github" | "google_calendar";

export interface Task {
  // ... campos existentes ...
  google_event_id: string | null;
}

export interface AppConfig {
  // ... campos existentes ...
  google_connected: boolean;
}

export interface CalendarEventView {
  id: string;
  title: string;
  start_ms: number;
  end_ms: number;
  updated_ms: number;
}

export interface StateSnapshot {
  // ... campos existentes ...
  google_connected: boolean;
  google_error: string | null;
  google_last_sync_ms: number;
}
```

Em `google_calendar.rs`, adicione a busca do dia (reaproveita `parse_events_response` da Task 3):

```rust
pub async fn fetch_day_events(access_token: &str, day: &str) -> Result<Vec<CalendarEvent>, String> {
    let start = format!("{day}T00:00:00-03:00");
    let end = format!("{day}T23:59:59-03:00");
    let resp = auth_client(access_token)?
        .get(EVENTS_URL)
        .query(&[
            ("timeMin", start.as_str()),
            ("timeMax", end.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("falha ao buscar eventos do dia (HTTP {})", resp.status()));
    }
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    parse_events_response(&raw)
}
```

Em `commands.rs`:

```rust
#[tauri::command]
pub async fn google_list_day_events(day: String, shared: State<'_, Shared>) -> Result<Vec<google_calendar::CalendarEvent>, String> {
    let token = {
        let state = shared.lock();
        state.google_access_token.clone().ok_or_else(|| "conta Google não conectada".to_string())?
    };
    google_calendar::fetch_day_events(&token, &day).await
}

#[tauri::command]
pub async fn google_import_event(
    event: google_calendar::CalendarEvent,
    day: String,
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<StateSnapshot, String> {
    let minutes = (((event.end_ms - event.start_ms).max(60_000)) / 60_000) as u32;
    let (snapshot, _) = apply(&app, &shared, |state, now, _| {
        if let Some(mut task) = tasks::new_task(&event.title, TaskSource::GoogleCalendar, minutes.clamp(tasks::MIN_MINUTES, tasks::MAX_MINUTES), &day) {
            task.google_event_id = Some(event.id.clone());
            task.updated_at = now;
            state.tracker.tasks.push(task);
        }
    });
    Ok(snapshot)
}
```

Registre os dois comandos em `lib.rs`.

`src/widget/AgendaTab.tsx` (lista do dia com checkbox — segue o estilo de `GithubTab.tsx` já existente: leia esse arquivo antes de escrever este, pra bater o padrão de layout/invoke):

```tsx
import { useEffect, useState } from "react";
import { invoke } from "../lib/tauri";
import { isImported } from "../lib/agenda";
import type { CalendarEventView, StateSnapshot } from "../lib/types";

export function AgendaTab({ state, day }: { state: StateSnapshot; day: string }) {
  const [events, setEvents] = useState<CalendarEventView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<CalendarEventView[]>("google_list_day_events", { day })
      .then(setEvents)
      .catch((e) => setError(String(e)));
  }, [day]);

  const toggle = async (event: CalendarEventView, checked: boolean) => {
    if (!checked) return; // desmarcar remove a tarefa pelo fluxo normal de excluir tarefa
    await invoke("google_import_event", { event, day });
  };

  if (error) return <p className="agenda-error">{error}</p>;

  return (
    <ul className="agenda-list">
      {events.map((event) => {
        const imported = isImported(event.id, state.tasks);
        return (
          <li key={event.id}>
            <label>
              <input
                type="checkbox"
                checked={imported}
                disabled={imported}
                onChange={(e) => toggle(event, e.target.checked)}
              />
              {event.title}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
```

Confira a função real de chamada de comando em `src/lib/tauri.ts` (provavelmente já existe um `invoke` tipado ali — use-o em vez de importar `@tauri-apps/api/core` direto, se o projeto já centraliza isso).

- [ ] **Step 4: Rode o teste e confirme que passa**

Run: `bun test src/lib/agenda.test.ts`
Expected: PASS

- [ ] **Step 5: Compile o backend e o frontend**

Run: `cd src-tauri && cargo build` e `bun run build`
Expected: ambos sem erros.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/google_calendar.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src/lib/agenda.ts src/lib/agenda.test.ts src/lib/types.ts src/widget/AgendaTab.tsx
git commit -m "feat: aba Agenda com importação de eventos do dia como tarefa"
```

---

### Task 8: Loop de sincronização em background (push, conclusão, edição, exclusão)

**Files:**
- Modify: `src-tauri/src/commands.rs` (`refresh_google_now`, hook em `remove_task`)
- Modify: `src-tauri/src/lib.rs` (`spawn_google_sync_loop`)
- Test: `src-tauri/src/commands.rs` ou novo `src-tauri/src/google_sync.rs` para a lógica pura de decisão (recomendado: extrair a decisão "o que fazer com esta tarefa" pra uma função pura testável sem rede)

**Interfaces:**
- Consumes: `google_calendar::{done_title, strip_done_prefix, newer_wins, Winner, create_event, patch_event_title, delete_event, DeleteOutcome, CalendarEvent}` (Tasks 3–5), `Task.google_event_id/updated_at/done` (Task 1).
- Produces: `src-tauri/src/google_sync.rs` com `enum SyncAction { CreateRemote, PushTitle(String), PullTitle(String), MarkLocalDone, MarkLocalOpen, DeleteLocal, Noop }`, `fn decide(task: &Task, remote: Option<&google_calendar::CalendarEvent>) -> SyncAction`.

- [ ] **Step 1: Escreva os testes que falham**

Crie `src-tauri/src/google_sync.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::google_calendar::CalendarEvent;
    use crate::tracker::tasks::{Task, TaskSource};

    fn task(title: &str, done: bool, updated_at: i64, google_event_id: Option<&str>) -> Task {
        Task {
            id: "1".into(), title: title.into(), note: None, minutes: 25, done,
            created_at: String::new(), source: TaskSource::Manual, spent_secs: 0,
            day: "2026-10-12".into(), done_at: None, project: None, url: None,
            google_event_id: google_event_id.map(str::to_string), updated_at,
        }
    }

    fn remote(title: &str, updated_ms: i64) -> CalendarEvent {
        CalendarEvent { id: "evt".into(), title: title.into(), start_ms: 0, end_ms: 0, updated_ms }
    }

    #[test]
    fn a_manual_task_with_no_remote_yet_must_be_created() {
        let t = task("Nova tarefa", false, 100, None);
        assert_eq!(decide(&t, None), SyncAction::CreateRemote);
    }

    #[test]
    fn a_task_already_linked_with_no_matching_remote_was_deleted_on_google() {
        let t = task("Tarefa", false, 100, Some("evt"));
        assert_eq!(decide(&t, None), SyncAction::DeleteLocal);
    }

    #[test]
    fn marking_done_locally_after_the_remote_edit_pushes_the_checkmark() {
        let t = task("Tarefa", true, 200, Some("evt"));
        let r = remote("Tarefa", 100);
        assert_eq!(decide(&t, Some(&r)), SyncAction::PushTitle("✓ Tarefa".to_string()));
    }

    #[test]
    fn a_checkmark_added_remotely_after_the_local_edit_marks_the_task_done_locally() {
        let t = task("Tarefa", false, 100, Some("evt"));
        let r = remote("✓ Tarefa", 200);
        assert_eq!(decide(&t, Some(&r)), SyncAction::MarkLocalDone);
    }

    #[test]
    fn removing_the_checkmark_remotely_after_the_local_edit_reopens_the_task_locally() {
        let t = task("Tarefa", true, 100, Some("evt"));
        let r = remote("Tarefa", 200);
        assert_eq!(decide(&t, Some(&r)), SyncAction::MarkLocalOpen);
    }

    #[test]
    fn a_newer_local_title_edit_pushes_to_the_remote() {
        let t = task("Título novo", false, 200, Some("evt"));
        let r = remote("Título velho", 100);
        assert_eq!(decide(&t, Some(&r)), SyncAction::PushTitle("Título novo".to_string()));
    }

    #[test]
    fn a_newer_remote_title_edit_pulls_into_the_local_task() {
        let t = task("Título velho", false, 100, Some("evt"));
        let r = remote("Título novo", 200);
        assert_eq!(decide(&t, Some(&r)), SyncAction::PullTitle("Título novo".to_string()));
    }

    #[test]
    fn matching_titles_and_done_state_need_no_action() {
        let t = task("Tarefa", false, 100, Some("evt"));
        let r = remote("Tarefa", 50);
        assert_eq!(decide(&t, Some(&r)), SyncAction::Noop);
    }

    #[test]
    fn a_github_task_is_never_pushed_to_google() {
        let mut t = task("PR #5", false, 100, None);
        t.source = TaskSource::Github;
        assert_eq!(decide(&t, None), SyncAction::Noop);
    }
}
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `cd src-tauri && cargo test google_sync::`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implemente**

```rust
//! Decide, pra cada tarefa, o que fazer com o lado do Google — pura, sem
//! rede, pra ser testável de verdade. `src-tauri/src/lib.rs` chama
//! `decide` pra cada tarefa a cada ciclo e aplica a `SyncAction` via
//! `google_calendar`.

use crate::google_calendar::{self, CalendarEvent, Winner};
use crate::tracker::tasks::{Task, TaskSource};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncAction {
    CreateRemote,
    PushTitle(String),
    PullTitle(String),
    MarkLocalDone,
    MarkLocalOpen,
    DeleteLocal,
    Noop,
}

pub fn decide(task: &Task, remote: Option<&CalendarEvent>) -> SyncAction {
    if task.source == TaskSource::Github {
        return SyncAction::Noop; // tarefas do GitHub nunca sincronizam com o Google
    }
    let Some(remote) = remote else {
        return if task.google_event_id.is_some() {
            SyncAction::DeleteLocal // tinha evento, não tem mais -> foi apagado no Google
        } else {
            SyncAction::CreateRemote
        };
    };

    let local_title = if task.done { google_calendar::done_title(&task.title) } else { task.title.clone() };
    let (remote_plain_title, remote_done) = google_calendar::strip_done_prefix(&remote.title);

    if local_title == remote.title && task.done == remote_done {
        return SyncAction::Noop;
    }

    match google_calendar::newer_wins(task.updated_at, remote.updated_ms) {
        Winner::Local => SyncAction::PushTitle(local_title),
        Winner::Remote if remote_done != task.done => {
            if remote_done {
                SyncAction::MarkLocalDone
            } else {
                SyncAction::MarkLocalOpen
            }
        }
        Winner::Remote => SyncAction::PullTitle(remote_plain_title),
    }
}
```

Adicione `mod google_sync;` em `lib.rs`.

Em `commands.rs`, adicione `refresh_google_now` (espelha `refresh_github_now`):

```rust
pub(crate) async fn refresh_google_now(app: &AppHandle) -> Result<(), String> {
    // Renova o access token no início de todo ciclo em vez de reusar o que
    // está em memória: o access token do Google dura ~1h e o ciclo roda a
    // cada 5 min, então refazer sempre evita o caso de expirar no meio de
    // um ciclo e a sincronização parar de funcionar sem o usuário notar.
    let refresh_token = google_calendar::load_refresh_token().ok_or_else(|| "sem refresh token salvo".to_string())?;
    let tokens = google_calendar::refresh_access_token(&refresh_token, GOOGLE_CLIENT_ID).await?;
    let token = tokens.access_token;
    {
        let mut state = app.state::<Shared>().lock();
        if !state.config.google_connected {
            return Ok(()); // desconectou enquanto o refresh estava em voo
        }
        state.google_access_token = Some(token.clone());
    }

    let tasks = { app.state::<Shared>().lock().tracker.tasks.clone() };
    let today = crate::tracker::today_key();
    let remote_events = google_calendar::fetch_day_events(&token, &today).await?;

    for task in &tasks {
        let remote = task.google_event_id.as_ref().and_then(|id| remote_events.iter().find(|e| &e.id == id));
        match google_sync::decide(task, remote) {
            google_sync::SyncAction::CreateRemote => {
                let start_ms = chrono::Utc::now().timestamp_millis();
                let end_ms = start_ms + (task.minutes as i64) * 60_000;
                if let Ok(event_id) = google_calendar::create_event(&token, &task.title, start_ms, end_ms).await {
                    let mut state = app.state::<Shared>().lock();
                    if let Some(t) = state.tracker.tasks.iter_mut().find(|t| t.id == task.id) {
                        t.google_event_id = Some(event_id);
                    }
                    state.save_tracker();
                }
            }
            google_sync::SyncAction::PushTitle(title) => {
                if let Some(id) = &task.google_event_id {
                    let _ = google_calendar::patch_event_title(&token, id, &title).await;
                }
            }
            google_sync::SyncAction::PullTitle(title) => {
                let mut state = app.state::<Shared>().lock();
                if let Some(t) = state.tracker.tasks.iter_mut().find(|t| t.id == task.id) {
                    t.title = title;
                    t.updated_at = chrono::Utc::now().timestamp_millis();
                }
                state.save_tracker();
            }
            google_sync::SyncAction::MarkLocalDone | google_sync::SyncAction::MarkLocalOpen => {
                let done = matches!(google_sync::decide(task, remote), google_sync::SyncAction::MarkLocalDone);
                let mut state = app.state::<Shared>().lock();
                if let Some(t) = state.tracker.tasks.iter_mut().find(|t| t.id == task.id) {
                    t.done = done;
                    t.updated_at = chrono::Utc::now().timestamp_millis();
                }
                state.save_tracker();
            }
            google_sync::SyncAction::DeleteLocal => {
                let mut state = app.state::<Shared>().lock();
                state.tracker.tasks.retain(|t| t.id != task.id);
                state.save_tracker();
            }
            google_sync::SyncAction::Noop => {}
        }
    }

    let mut state = app.state::<Shared>().lock();
    state.google_last_sync_ms = chrono::Utc::now().timestamp_millis();
    state.google_error = None;
    sync_ui(app, &state);
    Ok(())
}
```

Ajuste o acesso a `app.state::<Shared>().lock()` repetido pra bater com o padrão real de lock já usado no arquivo (`apply()`/`shared.lock()`) em vez de travar e destravar várias vezes — revise contra `refresh_github_now` e simplifique pra uma única seção crítica por iteração do `for`, igual ao estilo já usado ali.

No `remove_task` existente (`commands.rs`), antes de remover a tarefa do estado, capture `google_event_id` e, se houver, dispare a exclusão remota sem bloquear a resposta:

```rust
#[tauri::command]
pub fn remove_task(id: String, app: AppHandle, shared: State<'_, Shared>) -> StateSnapshot {
    let google_event_id = {
        let state = shared.lock();
        state.tracker.tasks.iter().find(|t| t.id == id).and_then(|t| t.google_event_id.clone())
    };
    if let (Some(event_id), Some(token)) = (google_event_id, shared.lock().google_access_token.clone()) {
        let app2 = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = google_calendar::delete_event(&token, &event_id).await;
            let _ = app2; // reservado caso precise notificar a UI depois
        });
    }
    apply(&app, &shared, |state, now, today| state.tracker.remove_task(&id, now, today)).0
}
```

Em `lib.rs`, adicione o loop de fundo (espelha `spawn_github_refresh_loop`):

```rust
const GOOGLE_SYNC_EVERY: Duration = Duration::from_secs(5 * 60);

fn spawn_google_sync_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(3)).await;
        loop {
            let connected = {
                let shared = app.state::<Shared>();
                let state = shared.lock();
                state.config.google_connected
            };
            if connected {
                if let Err(e) = commands::refresh_google_now(&app).await {
                    let shared = app.state::<Shared>();
                    shared.lock().google_error = Some(e);
                }
            }
            tokio::time::sleep(GOOGLE_SYNC_EVERY).await;
        }
    });
}
```

Chame `spawn_google_sync_loop(handle.clone());` junto das outras chamadas de `spawn_*` em `setup`.

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `cd src-tauri && cargo test google_sync::`
Expected: PASS

- [ ] **Step 5: Compile tudo**

Run: `cd src-tauri && cargo build`
Expected: compila sem erros.

- [ ] **Step 6: Verificação manual do refresh de token** (Review Focus: token expirado durante um ciclo de sync)

Conecte a conta, espere mais de 1h com o app aberto (ou force localmente trocando `GOOGLE_SYNC_EVERY` por um valor curto num build de teste e deixando passar o tempo equivalente a uma expiração) e confirme nos logs/`google_error` que os ciclos continuam funcionando sem pedir pra reconectar — cada ciclo já busca um access token novo via `refresh_access_token` antes de sincronizar, então nunca deveria usar um token vencido.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/google_sync.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: loop de sincronização em background com o Google Agenda"
```

---

### Task 9: UI de conexão nas configurações e status na aba Agenda

**Files:**
- Modify: `src/settings/` (componente de conta/integrações — leia a seção do GitHub existente antes de escrever esta, pra bater o padrão visual/estrutural)
- Modify: `src/widget/AgendaTab.tsx` (texto de status "Sincronizado às HH:MM")
- Modify: `src/widget/Panel.tsx` (aba "Agenda" só visível quando `google_connected`)

**Interfaces:**
- Consumes: `StateSnapshot.google_connected/google_error/google_last_sync_ms` (Task 7), comandos `google_connect`/`google_disconnect` (Task 6).

- [ ] **Step 1: Mapeie o componente de settings do GitHub**

Abra o arquivo em `src/settings/` que renderiza a seção "GitHub" (conectar/desconectar, status de conexão) e identifique seu componente e padrão de props/estado — esta task replica a mesma forma pra "Google Agenda", então não há teste novo isolado: a cobertura é o teste manual do Step 4 em cima do fluxo real de OAuth já testado nas Tasks 2–3 e 6.

- [ ] **Step 2: Implemente a seção "Google Agenda" nas configurações**

Copie o componente de settings do GitHub pra uma seção nova "Google Agenda", trocando:
- Texto: "Conectar com o Google" / "Desconectado" / "Conectado".
- Chamadas: `invoke("google_connect")` / `invoke("google_disconnect")` em vez dos comandos do GitHub.
- Status: mostra `google_error` quando presente (mesmo estilo do `github_error`), senão "Sincronizado às HH:MM" formatando `google_last_sync_ms` (reaproveite o helper de formatação de hora já usado pelo bloco "Atualizações" do updater, se houver um compartilhado em `src/lib`).

Em `Panel.tsx`, adicione a aba "Agenda" (`<AgendaTab state={state} day={day} />`, Task 7) à lista de abas, condicionada a `state.config.google_connected` — mesmo padrão da aba GitHub, que só aparece conectado.

- [ ] **Step 3: Verificação manual**

Rode o app (`bun run tauri dev`), conecte uma conta Google de teste, confirme:
- O botão abre o navegador, a tela "pode fechar essa aba" aparece após autorizar, e o app mostra "Conectado" sem precisar reiniciar.
- A aba "Agenda" aparece na lista de abas do painel.
- "Desconectar" volta pro estado "Desconectado" e a aba "Agenda" desaparece.

- [ ] **Step 4: Commit**

```bash
git add src/settings src/widget/AgendaTab.tsx src/widget/Panel.tsx
git commit -m "feat: UI de conexão com o Google Agenda nas configurações"
```

---

## Verificação final (manual, ponta a ponta)

Depois da Task 9, repita a verificação manual da seção 7 da spec: puxar um evento de teste, marcar a tarefa como feita e confirmar o "✓ " na Agenda de verdade; editar o título no app e confirmar refletido na Agenda e vice-versa; excluir de cada lado e confirmar que some do outro.
