use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

const SERVICE: &str = "focusbrew";
const ACCOUNT: &str = "github-pat";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubItem {
    pub number: u64,
    pub title: String,
    pub html_url: String,
    pub repository: String,
    pub is_pull_request: bool,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    items: Vec<SearchItem>,
}

#[derive(Debug, Deserialize)]
struct SearchItem {
    number: u64,
    title: String,
    html_url: String,
    updated_at: String,
    repository_url: String,
    pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct GithubUser {
    login: String,
}

pub fn save_token(token: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

pub fn load_token() -> Option<String> {
    keyring::Entry::new(SERVICE, ACCOUNT)
        .ok()
        .and_then(|entry| entry.get_password().ok())
}

pub fn clear_token() -> Result<(), String> {
    match keyring::Entry::new(SERVICE, ACCOUNT) {
        Ok(entry) => entry.delete_credential().map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}

/// Where the token used for the GitHub calls came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenSource {
    /// The GitHub CLI's login (`gh auth token`).
    Gh,
    /// A Personal Access Token pasted in the app (OS keyring).
    Manual,
}

/// How long `gh auth token` may take before we give up on it (it can hang
/// on a keyring prompt).
const GH_TIMEOUT: Duration = Duration::from_secs(10);

/// `gh auth token` prints the token plus a newline; nothing means "not
/// logged in".
fn parse_gh_token(stdout: &str) -> Option<String> {
    let token = stdout.trim();
    (!token.is_empty()).then(|| token.to_string())
}

/// gh first (unless the user turned it off), the saved token as fallback.
pub fn pick_token(
    use_gh: bool,
    gh: Option<String>,
    manual: Option<String>,
) -> Option<(String, TokenSource)> {
    if use_gh {
        if let Some(token) = gh {
            return Some((token, TokenSource::Gh));
        }
    }
    manual.map(|token| (token, TokenSource::Manual))
}

/// Runs a command and returns its trimmed stdout, or `None` if it can't be
/// started, fails, prints nothing or outlives `timeout`.
async fn run_token_command(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut command = tokio::process::Command::new(program);
    command
        .args(args)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    // No console window flashing every time the app asks gh for a token.
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let output = tokio::time::timeout(timeout, command.output()).await.ok()?.ok()?;
    if !output.status.success() {
        return None;
    }
    parse_gh_token(&String::from_utf8_lossy(&output.stdout))
}

/// The GitHub CLI's token, if gh is installed and logged in.
pub async fn gh_token() -> Option<String> {
    if let Some(token) = run_token_command("gh", &["auth", "token"], GH_TIMEOUT).await {
        return Some(token);
    }
    // gh installed as a .cmd shim (scoop, etc.) isn't found without a shell.
    #[cfg(windows)]
    return run_token_command("cmd", &["/C", "gh", "auth", "token"], GH_TIMEOUT).await;
    #[cfg(not(windows))]
    None
}

fn client(token: &str) -> Result<reqwest::Client, String> {
    use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {token}")).map_err(|e| e.to_string())?,
    );
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("focusbrew"));
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

/// Validates the token and returns the authenticated user's login.
pub async fn whoami(token: &str) -> Result<String, String> {
    let client = client(token)?;
    let resp = client
        .get("https://api.github.com/user")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub rejected the token (HTTP {})", resp.status()));
    }
    let user: GithubUser = resp.json().await.map_err(|e| e.to_string())?;
    Ok(user.login)
}

/// Fetches open PRs and issues where `login` is involved.
pub async fn fetch_involved(token: &str, login: &str) -> Result<Vec<GithubItem>, String> {
    let client = client(token)?;
    let query = format!("is:open involves:{login} archived:false");
    let resp = client
        .get("https://api.github.com/search/issues")
        .query(&[("q", query.as_str()), ("sort", "updated"), ("per_page", "30")])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub search failed (HTTP {})", resp.status()));
    }
    let parsed: SearchResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .items
        .into_iter()
        .map(|item| {
            let repository = item
                .repository_url
                .rsplit("/repos/")
                .next()
                .unwrap_or("")
                .to_string();
            GithubItem {
                number: item.number,
                title: item.title,
                html_url: item.html_url,
                repository,
                is_pull_request: item.pull_request.is_some(),
                updated_at: item.updated_at,
            }
        })
        .collect())
}

#[derive(Debug, Deserialize)]
struct ContributionsResponse {
    data: Option<ContributionsData>,
}
#[derive(Debug, Deserialize)]
struct ContributionsData {
    user: Option<ContributionsUser>,
}
#[derive(Debug, Deserialize)]
struct ContributionsUser {
    #[serde(rename = "contributionsCollection")]
    contributions_collection: ContributionsCollection,
}
#[derive(Debug, Deserialize)]
struct ContributionsCollection {
    #[serde(rename = "contributionCalendar")]
    contribution_calendar: ContributionCalendar,
}
#[derive(Debug, Deserialize)]
struct ContributionCalendar {
    weeks: Vec<ContributionWeek>,
}
#[derive(Debug, Deserialize)]
struct ContributionWeek {
    #[serde(rename = "contributionDays")]
    contribution_days: Vec<ContributionDay>,
}
#[derive(Debug, Deserialize)]
struct ContributionDay {
    date: String,
    #[serde(rename = "contributionCount")]
    contribution_count: u32,
}

const CONTRIBUTIONS_QUERY: &str = r#"
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
"#;

/// Fetches the user's real GitHub contribution calendar ("date" ->
/// contribution count), used to drive the widget's streak heatmap instead
/// of a locally-invented one.
pub async fn fetch_contribution_calendar(
    token: &str,
    login: &str,
) -> Result<HashMap<String, u32>, String> {
    let client = client(token)?;
    let body = serde_json::json!({
        "query": CONTRIBUTIONS_QUERY,
        "variables": { "login": login },
    });
    let resp = client
        .post("https://api.github.com/graphql")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub GraphQL failed (HTTP {})", resp.status()));
    }
    let parsed: ContributionsResponse = resp.json().await.map_err(|e| e.to_string())?;
    let weeks = parsed
        .data
        .and_then(|d| d.user)
        .map(|u| u.contributions_collection.contribution_calendar.weeks)
        .ok_or_else(|| "unexpected GitHub contributions response".to_string())?;

    let mut days = HashMap::new();
    for week in weeks {
        for day in week.contribution_days {
            days.insert(day.date, day.contribution_count);
        }
    }
    Ok(days)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn gh_output_is_trimmed() {
        assert_eq!(parse_gh_token("gho_abc123\r\n"), Some("gho_abc123".to_string()));
    }

    #[test]
    fn empty_gh_output_means_not_logged_in() {
        assert_eq!(parse_gh_token(""), None);
        assert_eq!(parse_gh_token("  \n"), None);
    }

    #[test]
    fn gh_token_wins_over_saved_token() {
        let picked = pick_token(true, Some("gh".into()), Some("pat".into()));
        assert_eq!(picked, Some(("gh".to_string(), TokenSource::Gh)));
    }

    #[test]
    fn saved_token_is_the_fallback_when_gh_has_none() {
        let picked = pick_token(true, None, Some("pat".into()));
        assert_eq!(picked, Some(("pat".to_string(), TokenSource::Manual)));
    }

    // "Desconectar" turns gh off; it must not reconnect through gh.
    #[test]
    fn gh_is_ignored_when_disabled() {
        assert_eq!(pick_token(false, Some("gh".into()), None), None);
        let picked = pick_token(false, Some("gh".into()), Some("pat".into()));
        assert_eq!(picked, Some(("pat".to_string(), TokenSource::Manual)));
    }

    #[test]
    fn no_token_anywhere() {
        assert_eq!(pick_token(true, None, None), None);
    }

    #[tokio::test]
    async fn missing_program_yields_no_token() {
        let out = run_token_command("focusbrew-no-such-program", &[], Duration::from_secs(2)).await;
        assert_eq!(out, None);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn hung_command_times_out() {
        let started = std::time::Instant::now();
        let out = run_token_command("cmd", &["/C", "ping -n 6 127.0.0.1 >nul & echo late"], Duration::from_millis(500)).await;
        assert_eq!(out, None);
        assert!(started.elapsed() < Duration::from_secs(3), "must not wait for the command");
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn command_output_becomes_the_token() {
        let out = run_token_command("cmd", &["/C", "echo tok_123"], Duration::from_secs(5)).await;
        assert_eq!(out, Some("tok_123".to_string()));
    }
}
