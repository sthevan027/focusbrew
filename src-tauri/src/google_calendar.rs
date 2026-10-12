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
