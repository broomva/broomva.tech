use std::pin::Pin;
use std::time::Instant;

use super::{Sensor, SensorContext, SensorResult, SensorStatus};

/// Generic Railway service sensor — checks Symphony, Arcan, Lago, Autonomic endpoints.
pub struct RailwayHealthSensor;

impl Sensor for RailwayHealthSensor {
    fn id(&self) -> &str {
        "railway_health"
    }

    fn run<'a>(
        &'a self,
        ctx: &'a SensorContext,
    ) -> Pin<Box<dyn std::future::Future<Output = SensorResult> + Send + 'a>> {
        Box::pin(async move {
            let start = Instant::now();

            let services: Vec<(&str, Option<&str>)> = vec![
                ("symphony", ctx.symphony_url.as_deref()),
                ("arcan", ctx.arcan_url.as_deref()),
                ("lago", ctx.lago_url.as_deref()),
                ("autonomic", ctx.autonomic_url.as_deref()),
            ];

            let mut results = serde_json::Map::new();
            let mut configured = 0u32;
            let mut healthy = 0u32;

            for (name, url) in &services {
                if let Some(url) = url {
                    configured += 1;
                    let health_url = format!("{url}/healthz");
                    let ok = ctx
                        .client
                        .get(&health_url)
                        .send()
                        .await
                        .map(|r| r.status().is_success())
                        .unwrap_or(false);
                    if ok {
                        healthy += 1;
                    }
                    results.insert(
                        name.to_string(),
                        serde_json::json!({ "url": url, "healthy": ok }),
                    );
                } else {
                    results.insert(name.to_string(), serde_json::json!({ "configured": false }));
                }
            }

            let latency = start.elapsed().as_millis() as u64;

            let (status, message) = if configured == 0 {
                (
                    SensorStatus::Healthy,
                    "no railway services configured".into(),
                )
            } else if healthy == configured {
                (
                    SensorStatus::Healthy,
                    format!("{healthy}/{configured} services healthy"),
                )
            } else if healthy > 0 {
                (
                    SensorStatus::Degraded,
                    format!("{healthy}/{configured} services healthy"),
                )
            } else {
                (
                    SensorStatus::Down,
                    format!("0/{configured} services healthy"),
                )
            };

            SensorResult {
                sensor_id: self.id().into(),
                status,
                message,
                latency_ms: Some(latency),
                details: Some(serde_json::Value::Object(results)),
            }
        })
    }
}
