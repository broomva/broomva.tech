use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use serde::Serialize;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use super::logger::DaemonLogger;
use super::sensors::{Sensor, SensorContext, SensorResult, SensorStatus};

/// Shared heartbeat state exposed to the dashboard.
#[derive(Debug, Clone, Serialize)]
pub struct HeartbeatState {
    pub started_at: String,
    pub last_tick: Option<String>,
    pub tick_count: u64,
    pub results: Vec<SensorResult>,
    pub overall_status: SensorStatus,
    pub consecutive_failures: u32,
}

impl Default for HeartbeatState {
    fn default() -> Self {
        Self {
            started_at: Utc::now().to_rfc3339(),
            last_tick: None,
            tick_count: 0,
            results: vec![],
            overall_status: SensorStatus::Healthy,
            consecutive_failures: 0,
        }
    }
}

/// The heartbeat loop that drives sensor polling.
pub struct HeartbeatLoop {
    sensors: Vec<Box<dyn Sensor>>,
    interval_ms: u64,
    state: Arc<RwLock<HeartbeatState>>,
    logger: DaemonLogger,
    cancel: CancellationToken,
    sensor_ctx: SensorContext,
}

impl HeartbeatLoop {
    pub fn new(
        sensors: Vec<Box<dyn Sensor>>,
        interval_ms: u64,
        state: Arc<RwLock<HeartbeatState>>,
        cancel: CancellationToken,
        sensor_ctx: SensorContext,
    ) -> Self {
        Self {
            sensors,
            interval_ms,
            state,
            logger: DaemonLogger::new(),
            cancel,
            sensor_ctx,
        }
    }

    pub async fn run(&self) {
        self.logger.info("heartbeat loop starting");
        let mut interval = tokio::time::interval(Duration::from_millis(self.interval_ms));

        loop {
            tokio::select! {
                _ = interval.tick() => self.tick().await,
                _ = self.cancel.cancelled() => {
                    self.logger.info("heartbeat loop stopping");
                    break;
                }
            }
        }
    }

    async fn tick(&self) {
        let mut results = Vec::with_capacity(self.sensors.len());

        for sensor in &self.sensors {
            let result = sensor.run(&self.sensor_ctx).await;

            let level = match result.status {
                SensorStatus::Healthy => "info",
                SensorStatus::Degraded => "warn",
                SensorStatus::Down => "error",
            };
            self.logger
                .sensor_result(sensor.id(), level, &result.message, result.details.clone());

            results.push(result);
        }

        // Compute overall status.
        let overall = if results.iter().any(|r| r.status == SensorStatus::Down) {
            SensorStatus::Down
        } else if results.iter().any(|r| r.status == SensorStatus::Degraded) {
            SensorStatus::Degraded
        } else {
            SensorStatus::Healthy
        };

        let mut state = self.state.write().await;
        state.tick_count += 1;
        state.last_tick = Some(Utc::now().to_rfc3339());
        state.results = results;
        state.overall_status = overall;

        if overall == SensorStatus::Down {
            state.consecutive_failures += 1;
        } else {
            state.consecutive_failures = 0;
        }
    }
}
