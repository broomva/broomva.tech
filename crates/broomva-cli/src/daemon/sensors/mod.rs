pub mod api_health;
pub mod railway_health;
pub mod site_health;

use serde::Serialize;

/// Result of a single sensor check.
#[derive(Debug, Clone, Serialize)]
pub struct SensorResult {
    pub sensor_id: String,
    pub status: SensorStatus,
    pub message: String,
    pub latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SensorStatus {
    Healthy,
    Degraded,
    Down,
}

/// Context passed to sensors during each tick.
pub struct SensorContext {
    pub broomva_url: String,
    pub symphony_url: Option<String>,
    pub arcan_url: Option<String>,
    pub lago_url: Option<String>,
    pub autonomic_url: Option<String>,
    pub client: reqwest::Client,
}

/// A sensor that checks some aspect of the infrastructure.
pub trait Sensor: Send + Sync {
    fn id(&self) -> &str;
    fn run<'a>(
        &'a self,
        ctx: &'a SensorContext,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = SensorResult> + Send + 'a>>;
}

/// Build the default set of sensors.
pub fn default_sensors() -> Vec<Box<dyn Sensor>> {
    vec![
        Box::new(site_health::SiteHealthSensor),
        Box::new(api_health::ApiHealthSensor),
        Box::new(railway_health::RailwayHealthSensor),
    ]
}
