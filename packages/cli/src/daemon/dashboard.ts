import { createServer, type Server } from "node:http";
import type { HeartbeatState } from "../types/daemon.js";
import type { DaemonLogger } from "./logger.js";
import type { SymphonyHttpClient } from "./symphony-client.js";

export class Dashboard {
	private server: Server | null = null;
	private port: number;
	private logger: DaemonLogger;
	private getState: () => HeartbeatState;
	private symphonyClient: SymphonyHttpClient | null;

	constructor(opts: {
		port: number;
		logger: DaemonLogger;
		getState: () => HeartbeatState;
		symphonyClient: SymphonyHttpClient | null;
	}) {
		this.port = opts.port;
		this.logger = opts.logger;
		this.getState = opts.getState;
		this.symphonyClient = opts.symphonyClient;
	}

	start(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = createServer(async (req, res) => {
				const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);

				try {
					if (url.pathname === "/healthz") {
						res.writeHead(200, { "Content-Type": "text/plain" });
						res.end("OK");
					} else if (url.pathname === "/api/health") {
						const state = this.getState();
						res.writeHead(200, {
							"Content-Type": "application/json",
						});
						res.end(JSON.stringify(state, null, 2));
					} else if (url.pathname === "/api/symphony") {
						if (!this.symphonyClient) {
							res.writeHead(503, {
								"Content-Type": "application/json",
							});
							res.end(
								JSON.stringify({
									error: "Symphony not configured",
								}),
							);
							return;
						}
						const state = await this.symphonyClient.getState();
						res.writeHead(state ? 200 : 503, {
							"Content-Type": "application/json",
						});
						res.end(
							JSON.stringify(
								state ?? { error: "Symphony unreachable" },
								null,
								2,
							),
						);
					} else if (url.pathname === "/") {
						const state = this.getState();
						res.writeHead(200, { "Content-Type": "text/html" });
						res.end(renderDashboard(state));
					} else {
						res.writeHead(404, {
							"Content-Type": "text/plain",
						});
						res.end("Not found");
					}
				} catch (err) {
					this.logger.error("Dashboard request error", {
						path: url.pathname,
						error: err instanceof Error ? err.message : String(err),
					});
					res.writeHead(500, {
						"Content-Type": "text/plain",
					});
					res.end("Internal error");
				}
			});

			this.server.on("error", (err) => {
				this.logger.error("Dashboard server error", {
					error: err.message,
				});
				reject(err);
			});

			this.server.listen(this.port, () => {
				this.logger.info(`Dashboard listening on port ${this.port}`);
				resolve();
			});
		});
	}

	stop(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}
}

function renderDashboard(state: HeartbeatState): string {
	const sensorRows = Object.values(state.sensors)
		.map((s) => {
			const color =
				s.status === "healthy"
					? "#22c55e"
					: s.status === "degraded"
						? "#eab308"
						: s.status === "down"
							? "#ef4444"
							: "#6b7280";
			const latency = s.latencyMs !== undefined ? `${s.latencyMs}ms` : "—";
			return `<tr>
				<td><span style="color:${color}; font-weight:bold;">${s.status.toUpperCase()}</span></td>
				<td>${s.sensorId}</td>
				<td>${s.message}</td>
				<td>${latency}</td>
				<td>${s.timestamp}</td>
			</tr>`;
		})
		.join("\n");

	const openIncidents = state.incidents.filter((i) => i.status === "open");
	const incidentRows =
		openIncidents.length > 0
			? openIncidents
					.map(
						(i) => `<tr>
				<td>${i.id}</td>
				<td>${i.sensorId}</td>
				<td>${i.message}</td>
				<td>${i.consecutiveFailures}</td>
				<td>${i.openedAt}</td>
			</tr>`,
					)
					.join("\n")
			: '<tr><td colspan="5" style="text-align:center; color:#6b7280;">No open incidents</td></tr>';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>broomvad — Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
         background: #0a0a0a; color: #e5e5e5; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #fff; }
  .meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 2rem; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; color: #d1d5db; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #1f1f1f; }
  th { color: #9ca3af; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .symphony { padding: 0.5rem 0.75rem; background: #111; border-radius: 4px; }
  .symphony.connected { border-left: 3px solid #22c55e; }
  .symphony.disconnected { border-left: 3px solid #ef4444; }
</style>
</head>
<body>
<h1>broomvad</h1>
<div class="meta">
  Started: ${state.startedAt} | Last tick: ${state.lastTickAt ?? "—"} | Ticks: ${state.tickCount}
  | Symphony: <span style="color:${state.symphonyConnected ? "#22c55e" : "#ef4444"}">${state.symphonyConnected ? "connected" : "disconnected"}</span>
</div>

<h2>Sensors</h2>
<table>
<tr><th>Status</th><th>Sensor</th><th>Message</th><th>Latency</th><th>Checked</th></tr>
${sensorRows || '<tr><td colspan="5" style="text-align:center; color:#6b7280;">No sensor data yet</td></tr>'}
</table>

<h2>Open Incidents</h2>
<table>
<tr><th>ID</th><th>Sensor</th><th>Message</th><th>Failures</th><th>Opened</th></tr>
${incidentRows}
</table>
</body>
</html>`;
}
