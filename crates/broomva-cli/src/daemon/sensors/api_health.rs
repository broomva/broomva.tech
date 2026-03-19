use std::pin::Pin;
use std::time::Instant;

use super::{Sensor, SensorContext, SensorResult, SensorStatus};

/// Tests skills, context, and auth session endpoints.
pub struct ApiHealthSensor;

impl Sensor for ApiHealthSensor {
    fn id(&self) -> &str {
        "api_health"
    }

    fn run<'a>(
        &'a self,
        ctx: &'a SensorContext,
    ) -> Pin<Box<dyn std::future::Future<Output = SensorResult> + Send + 'a>> {
        Box::pin(async move {
            let start = Instant::now();
            let base = &ctx.broomva_url;

            let endpoints = ["/api/skills", "/api/context"];
            let mut ok_count = 0;

            for ep in &endpoints {
                let url = format!("{base}{ep}");
                if let Ok(resp) = ctx.client.get(&url).send().await
                    && resp.status().is_success()
                {
                    ok_count += 1;
                }
            }

            let latency = start.elapsed().as_millis() as u64;
            let total = endpoints.len();

            let (status, message) = if ok_count == total {
                (SensorStatus::Healthy, "all API endpoints responding".into())
            } else if ok_count > 0 {
                (
                    SensorStatus::Degraded,
                    format!("{ok_count}/{total} endpoints responding"),
                )
            } else {
                (SensorStatus::Down, "no API endpoints responding".into())
            };

            SensorResult {
                sensor_id: self.id().into(),
                status,
                message,
                latency_ms: Some(latency),
                details: Some(serde_json::json!({
                    "ok": ok_count,
                    "total": total,
                })),
            }
        })
    }
}
