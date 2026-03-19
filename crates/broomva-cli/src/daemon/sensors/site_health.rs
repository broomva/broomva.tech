use std::pin::Pin;
use std::time::Instant;

use super::{Sensor, SensorContext, SensorResult, SensorStatus};

/// Pings the main site root and /api/prompts.
pub struct SiteHealthSensor;

impl Sensor for SiteHealthSensor {
    fn id(&self) -> &str {
        "site_health"
    }

    fn run<'a>(
        &'a self,
        ctx: &'a SensorContext,
    ) -> Pin<Box<dyn std::future::Future<Output = SensorResult> + Send + 'a>> {
        Box::pin(async move {
            let start = Instant::now();

            let root_ok = ctx
                .client
                .get(&ctx.broomva_url)
                .send()
                .await
                .map(|r| r.status().is_success())
                .unwrap_or(false);

            let api_ok = ctx
                .client
                .get(format!("{}/api/prompts", ctx.broomva_url))
                .send()
                .await
                .map(|r| r.status().is_success())
                .unwrap_or(false);

            let latency = start.elapsed().as_millis() as u64;

            let (status, message) = match (root_ok, api_ok) {
                (true, true) => (SensorStatus::Healthy, "site and API responding".into()),
                (true, false) => (SensorStatus::Degraded, "site up but API failing".into()),
                (false, true) => (
                    SensorStatus::Degraded,
                    "API up but site root failing".into(),
                ),
                (false, false) => (SensorStatus::Down, "site and API unreachable".into()),
            };

            SensorResult {
                sensor_id: self.id().into(),
                status,
                message,
                latency_ms: Some(latency),
                details: Some(serde_json::json!({
                    "root": root_ok,
                    "api_prompts": api_ok,
                })),
            }
        })
    }
}
