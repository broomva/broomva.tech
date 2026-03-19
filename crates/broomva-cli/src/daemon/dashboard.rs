use std::sync::Arc;

use axum::Router;
use axum::extract::State;
use axum::response::Html;
use axum::routing::get;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

use super::heartbeat::HeartbeatState;
use super::symphony_client::SymphonyHttpClient;

#[derive(Clone)]
pub struct AppState {
    pub heartbeat: Arc<RwLock<HeartbeatState>>,
    pub symphony: Option<Arc<SymphonyHttpClient>>,
}

pub async fn start_dashboard(
    port: u16,
    heartbeat: Arc<RwLock<HeartbeatState>>,
    symphony: Option<SymphonyHttpClient>,
) -> anyhow::Result<()> {
    let state = AppState {
        heartbeat,
        symphony: symphony.map(Arc::new),
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/health", get(health_handler))
        .route("/api/symphony", get(symphony_handler))
        .route("/", get(dashboard_html))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("dashboard listening on http://0.0.0.0:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn healthz() -> &'static str {
    "OK"
}

async fn health_handler(State(state): State<AppState>) -> axum::Json<serde_json::Value> {
    let hs = state.heartbeat.read().await;
    axum::Json(serde_json::to_value(&*hs).unwrap_or_default())
}

async fn symphony_handler(State(state): State<AppState>) -> axum::Json<serde_json::Value> {
    if let Some(ref client) = state.symphony {
        let healthy = client.healthz().await;
        let symphony_state = client.get_state().await;
        axum::Json(serde_json::json!({
            "connected": healthy,
            "state": symphony_state.map(|s| s.data),
        }))
    } else {
        axum::Json(serde_json::json!({
            "connected": false,
            "message": "symphony not configured",
        }))
    }
}

async fn dashboard_html(State(state): State<AppState>) -> Html<String> {
    let hs = state.heartbeat.read().await;
    let status_class = match hs.overall_status {
        super::sensors::SensorStatus::Healthy => "healthy",
        super::sensors::SensorStatus::Degraded => "degraded",
        super::sensors::SensorStatus::Down => "down",
    };

    let sensors_html: String = hs
        .results
        .iter()
        .map(|r| {
            let s_class = match r.status {
                super::sensors::SensorStatus::Healthy => "healthy",
                super::sensors::SensorStatus::Degraded => "degraded",
                super::sensors::SensorStatus::Down => "down",
            };
            let latency = r
                .latency_ms
                .map(|l| format!("{l}ms"))
                .unwrap_or_else(|| "-".into());
            format!(
                r#"<tr><td class="{s_class}">{status:?}</td><td>{id}</td><td>{msg}</td><td>{lat}</td></tr>"#,
                s_class = s_class,
                status = r.status,
                id = r.sensor_id,
                msg = r.message,
                lat = latency,
            )
        })
        .collect();

    let html = format!(
        r#"<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>broomva daemon</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; background: #0d1117; color: #c9d1d9; }}
  h1 {{ font-size: 1.5rem; }}
  .badge {{ display: inline-block; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 0.85rem; }}
  .healthy {{ background: #238636; color: #fff; }}
  .degraded {{ background: #d29922; color: #000; }}
  .down {{ background: #da3633; color: #fff; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 1rem; }}
  th, td {{ text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; }}
  th {{ color: #8b949e; font-size: 0.85rem; text-transform: uppercase; }}
  .meta {{ color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem; }}
</style>
</head><body>
<h1>broomva daemon <span class="badge {status_class}">{status:?}</span></h1>
<p class="meta">Started: {started} | Ticks: {ticks} | Last: {last}</p>
<table>
<tr><th>Status</th><th>Sensor</th><th>Message</th><th>Latency</th></tr>
{sensors}
</table>
</body></html>"#,
        status_class = status_class,
        status = hs.overall_status,
        started = hs.started_at,
        ticks = hs.tick_count,
        last = hs.last_tick.as_deref().unwrap_or("-"),
        sensors = sensors_html,
    );

    Html(html)
}
