use chrono::{DateTime, SecondsFormat, Utc};
use reqwest::Client;
use serde::de::DeserializeOwned;
use std::time::Duration;

use super::models::{ActivitiesResponse, ConfigResponse, ConfigUpdate};

/// Fixed-width UTC millis; passed through reqwest's query encoder, so `+` offsets survive.
fn ts(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn offline(e: reqwest::Error) -> String {
    format!("Activity Tracking service offline: {e}")
}

async fn decode<T: DeserializeOwned>(response: reqwest::Response) -> Result<T, String> {
    response
        .error_for_status()
        .map_err(|e| format!("Activity Tracking service error: {e}"))?
        .json::<T>()
        .await
        .map_err(|e| format!("Invalid response from Activity Tracking service: {e}"))
}

pub struct ActivityClient {
    client: Client,
    base_url: String,
}

impl ActivityClient {
    pub fn new(port: u16) -> Self {
        ActivityClient {
            // A short timeout keeps the UI responsive when the service is down.
            client: Client::builder()
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap_or_else(|_| Client::new()),
            base_url: format!("http://127.0.0.1:{port}"),
        }
    }

    pub async fn get_activities(&self, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<ActivitiesResponse, String> {
        let response = self
            .client
            .get(format!("{}/api/activities", self.base_url))
            .query(&[("from", ts(from)), ("to", ts(to))])
            .send()
            .await
            .map_err(offline)?;
        decode(response).await
    }

    pub async fn get_config(&self) -> Result<ConfigResponse, String> {
        let response = self
            .client
            .get(format!("{}/api/config", self.base_url))
            .send()
            .await
            .map_err(offline)?;
        decode(response).await
    }

    pub async fn set_config(&self, update: ConfigUpdate) -> Result<ConfigResponse, String> {
        let response = self
            .client
            .post(format!("{}/api/config", self.base_url))
            .json(&update)
            .send()
            .await
            .map_err(offline)?;
        decode(response).await
    }

    pub async fn health(&self) -> bool {
        self.client
            .get(format!("{}/api/health", self.base_url))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn closed_port() -> u16 {
        // Bind to get a free port, then release it: nothing listens there now.
        std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
    }

    #[tokio::test]
    async fn offline_service_returns_error_instead_of_panicking() {
        let client = ActivityClient::new(closed_port());
        let now = Utc::now();
        let err = client.get_activities(now, now).await.unwrap_err();
        assert!(err.contains("offline"), "got: {err}");
    }

    #[tokio::test]
    async fn offline_service_reports_not_healthy() {
        assert!(!ActivityClient::new(closed_port()).health().await);
    }
}
