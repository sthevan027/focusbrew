//! Sincronização de tarefas com o Google Agenda: OAuth (PKCE, sem client
//! secret fixo), leitura/escrita de eventos e a regra de "edição mais
//! recente vence" ao conciliar os dois lados.

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
}
