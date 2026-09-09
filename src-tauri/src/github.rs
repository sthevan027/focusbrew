use std::collections::HashMap;

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
