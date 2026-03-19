import type { Sensor, SensorContext } from "./index.js";
import type { SensorResult } from "../../types/daemon.js";

export class RailwayHealthSensor implements Sensor {
	id: string;
	name: string;
	private serviceKey: "symphonyUrl" | "arcanUrl" | "lagoUrl" | "autonomicUrl";

	constructor(
		serviceId: string,
		serviceName: string,
		serviceKey: "symphonyUrl" | "arcanUrl" | "lagoUrl" | "autonomicUrl",
	) {
		this.id = `railway-${serviceId}`;
		this.name = `Railway ${serviceName}`;
		this.serviceKey = serviceKey;
	}

	async run(ctx: SensorContext): Promise<SensorResult> {
		const timestamp = new Date().toISOString();
		const baseUrl = ctx.config[this.serviceKey];

		if (!baseUrl) {
			return {
				sensorId: this.id,
				status: "unknown",
				message: `${this.name}: URL not configured (set daemon.${this.serviceKey})`,
				timestamp,
			};
		}

		const healthPaths = ["/healthz", "/health"];
		const results: Record<string, unknown> = {};

		for (const path of healthPaths) {
			const url = `${baseUrl.replace(/\/$/, "")}${path}`;
			const start = Date.now();
			try {
				const headers: Record<string, string> = {};
				if (ctx.token) {
					headers.Authorization = `Bearer ${ctx.token}`;
				}
				const res = await fetch(url, {
					headers,
					signal: AbortSignal.timeout(10_000),
				});
				const latency = Date.now() - start;

				if (res.ok) {
					results.health = {
						path,
						status: res.status,
						latencyMs: latency,
						ok: true,
					};

					// For Symphony, also try to get state
					if (this.serviceKey === "symphonyUrl") {
						await this.checkSymphonyState(baseUrl, ctx.token, results);
					}

					return {
						sensorId: this.id,
						status: "healthy",
						message: `${this.name} responding on ${path}`,
						latencyMs: latency,
						timestamp,
						data: results,
					};
				}

				results[path] = { status: res.status, latencyMs: latency, ok: false };
			} catch (err) {
				const latency = Date.now() - start;
				results[path] = {
					status: 0,
					latencyMs: latency,
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}

		return {
			sensorId: this.id,
			status: "down",
			message: `${this.name} unreachable`,
			timestamp,
			data: results,
		};
	}

	private async checkSymphonyState(
		baseUrl: string,
		token: string | null,
		results: Record<string, unknown>,
	): Promise<void> {
		try {
			const headers: Record<string, string> = {};
			if (token) {
				headers.Authorization = `Bearer ${token}`;
			}
			const res = await fetch(
				`${baseUrl.replace(/\/$/, "")}/api/v1/state`,
				{
					headers,
					signal: AbortSignal.timeout(10_000),
				},
			);
			if (res.ok) {
				const state = await res.json();
				results.symphonyState = state;
			}
		} catch {
			// Symphony state check is best-effort
		}
	}
}

export function createRailwaySensors(): RailwayHealthSensor[] {
	return [
		new RailwayHealthSensor("symphony", "Symphony", "symphonyUrl"),
		new RailwayHealthSensor("arcan", "Arcan", "arcanUrl"),
		new RailwayHealthSensor("lago", "Lago", "lagoUrl"),
		new RailwayHealthSensor("autonomic", "Autonomic", "autonomicUrl"),
	];
}
