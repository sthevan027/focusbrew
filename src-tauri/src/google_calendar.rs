//! Sincronização de tarefas com o Google Agenda: OAuth (PKCE, sem client
//! secret fixo), leitura/escrita de eventos e a regra de "edição mais
//! recente vence" ao conciliar os dois lados.

use chrono::TimeZone;
use sha2::{Digest, Sha256};

use crate::tracker::tasks::{self, Task, TaskSource};

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
    let mut bytes = Vec::with_capacity(48);
    for _ in 0..3 {
        bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    }
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
    items: Vec<serde_json::Value>,
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

/// Converte a resposta de `events.list` em `CalendarEvent`s. Um item que não
/// bate com o formato esperado é descartado sozinho, sem derrubar os outros.
pub fn parse_events_response(raw: &str) -> Result<Vec<CalendarEvent>, String> {
    let parsed: EventsResponse = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    Ok(parsed
        .items
        .into_iter()
        .filter_map(|value| serde_json::from_value::<RawEvent>(value).ok())
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

#[derive(Deserialize)]
struct CreatedEvent {
    id: String,
}

/// A resposta de criação traz o evento inteiro (summary, start, end...); só o
/// `id` interessa aqui, e a forma completa não bate com `CalendarEvent`.
fn parse_created_event_id(raw: &str) -> Result<String, String> {
    serde_json::from_str::<CreatedEvent>(raw).map(|e| e.id).map_err(|e| e.to_string())
}

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
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    parse_created_event_id(&raw)
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

/// Start and end of a local calendar day, as RFC 3339 for the Calendar API.
pub fn day_bounds(day: &str) -> Option<(String, String)> {
    let date = chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").ok()?;
    let start = chrono::Local.from_local_datetime(&date.and_hms_opt(0, 0, 0)?).single()?;
    let end = chrono::Local.from_local_datetime(&date.and_hms_opt(23, 59, 59)?).single()?;
    Some((start.to_rfc3339(), end.to_rfc3339()))
}

/// Adds the event as a task planned for `day`, unless a task already points at it.
pub fn import_event(tasks: &mut Vec<Task>, event: &CalendarEvent, day: &str, now_ms: i64) -> bool {
    if tasks.iter().any(|t| t.google_event_id.as_deref() == Some(event.id.as_str())) {
        return false;
    }
    let minutes = ((event.end_ms - event.start_ms) / 60_000).max(0) as u32;
    let (title, done) = strip_done_prefix(&event.title);
    let Some(mut task) = tasks::new_task(&title, TaskSource::GoogleCalendar, minutes, day) else {
        return false;
    };
    task.google_event_id = Some(event.id.clone());
    task.updated_at = now_ms;
    task.done = done;
    task.done_at = done.then_some(now_ms);
    tasks.push(task);
    true
}

/// Google's answer decides whether an event is really gone: a 404/410, or a
/// cancelled event. Anything else (a moved event, an outage) means it still exists.
pub fn gone_from_response(status: u16, body_status: Option<&str>) -> bool {
    matches!(status, 404 | 410) || body_status == Some("cancelled")
}

pub async fn event_is_gone(access_token: &str, event_id: &str) -> Result<bool, String> {
    let resp = auth_client(access_token)?
        .get(format!("{EVENTS_URL}/{event_id}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let body_status = if status == 200 {
        resp.json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|v| v["status"].as_str().map(str::to_string))
    } else {
        None
    };
    Ok(gone_from_response(status, body_status.as_deref()))
}

pub async fn fetch_day_events(access_token: &str, day: &str) -> Result<Vec<CalendarEvent>, String> {
    let (start, end) = day_bounds(day).ok_or_else(|| format!("dia inválido: {day}"))?;
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

    #[test]
    fn one_malformed_event_does_not_drop_the_rest_of_the_day() {
        let raw = r#"{"items":[
            {"id":"broken","start":{"dateTime":"2026-10-12T14:00:00-03:00"},
             "end":{"dateTime":"2026-10-12T15:00:00-03:00"}},
            {"id":"ok","summary":"Reunião",
             "start":{"dateTime":"2026-10-12T16:00:00-03:00"},
             "end":{"dateTime":"2026-10-12T17:00:00-03:00"},
             "updated":"2026-10-10T09:00:00.000Z"}
        ]}"#;
        let events = parse_events_response(raw).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "ok");
    }

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

    #[test]
    fn event_body_uses_rfc3339_with_the_right_shape() {
        let start_ms = 1_760_284_800_000i64;
        let end_ms = start_ms + 3_600_000;
        let body = event_body("Estudar Rust", start_ms, end_ms);
        assert_eq!(body["summary"], "Estudar Rust");
        assert!(body["start"]["dateTime"].as_str().unwrap().contains('T'));
        assert!(body["end"]["dateTime"].as_str().unwrap().contains('T'));
    }

    #[test]
    fn the_created_event_id_comes_out_of_googles_full_response() {
        let raw = r#"{"id":"evt-9","summary":"Estudar","start":{"dateTime":"2026-10-12T14:00:00-03:00"},
                       "end":{"dateTime":"2026-10-12T15:00:00-03:00"}}"#;
        assert_eq!(parse_created_event_id(raw).unwrap(), "evt-9");
    }

    #[test]
    fn a_created_event_response_without_an_id_is_an_error() {
        assert!(parse_created_event_id("{}").is_err());
    }

    #[test]
    fn the_day_bounds_are_the_local_day() {
        let (start, end) = day_bounds("2026-10-12").unwrap();
        assert!(start.starts_with("2026-10-12T00:00:00"));
        assert!(end.starts_with("2026-10-12T23:59:59"));
        assert_eq!(day_bounds("garbage"), None);
    }

    #[test]
    fn importing_a_finished_event_keeps_the_title_clean_and_the_state() {
        let event = CalendarEvent {
            id: "evt-2".into(),
            title: "✓ Reunião".into(),
            start_ms: 0,
            end_ms: 1_800_000,
            updated_ms: 0,
        };
        let mut list = Vec::new();
        assert!(import_event(&mut list, &event, "2026-10-12", 1_000));
        assert_eq!(list[0].title, "Reunião");
        assert!(list[0].done);
        assert_eq!(list[0].done_at, Some(1_000));
    }

    #[test]
    fn an_event_is_gone_only_when_google_says_so() {
        assert!(gone_from_response(404, None));
        assert!(gone_from_response(410, None));
        assert!(gone_from_response(200, Some("cancelled")));
        assert!(!gone_from_response(200, Some("confirmed")));
        assert!(!gone_from_response(500, None));
    }

    #[test]
    fn importing_an_event_makes_a_linked_task_once() {
        let event = CalendarEvent {
            id: "evt-1".into(),
            title: "Reunião".into(),
            start_ms: 0,
            end_ms: 3_600_000,
            updated_ms: 0,
        };
        let mut list = Vec::new();
        assert!(import_event(&mut list, &event, "2026-10-12", 1_000));
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].google_event_id.as_deref(), Some("evt-1"));
        assert_eq!(list[0].source, TaskSource::GoogleCalendar);
        assert_eq!(list[0].minutes, 60);
        assert_eq!(list[0].day, "2026-10-12");
        assert!(!import_event(&mut list, &event, "2026-10-12", 2_000));
        assert_eq!(list.len(), 1);
    }
}
