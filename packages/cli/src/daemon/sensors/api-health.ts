import type { SensorResult } from "../../types/daemon.js";
import type { Sensor, SensorContext } from "./index.js";

export class ApiHealthSensor implements Sensor {
	id = "api-health";
	name = "API Health";

	async run(ctx: SensorContext): Promise<SensorResult> {
		const timestamp = new Date().toISOString();
		const endpoints = [
			{ label: "skills", path: "/api/skills", auth: false },
			{ label: "context", path: "/api/context", auth: false },
			{
				label: "auth-device",
				path: "/api/auth/device/code",
				auth: false,
				method: "OPTIONS",
			},
		];

		if (ctx.token) {
			endpoints.push({
				label: "prompts-user",
				path: "/api/prompts/user",
				auth: true,
				method: "GET",
			});
		}

		const results: Record<string, unknown> = {};
		let healthyCount = 0;

		for (const ep of endpoints) {
			const url = `${ctx.apiBase}${ep.path}`;
			const start = Date.now();
			try {
				const headers: Record<string, string> = {};
				if (ep.auth && ctx.token) {
					headers.Authorization = `Bearer ${ctx.token}`;
				}
				const res = await fetch(url, {
					method: (ep as { method?: string }).method ?? "GET",
					headers,
					signal: AbortSignal.timeout(10_000),
				});
				const latency = Date.now() - start;
				const ok = res.status < 500;
				if (ok) healthyCount++;
				results[ep.label] = {
					status: res.status,
					latencyMs: latency,
					ok,
				};
			} catch (err) {
				const latency = Date.now() - start;
				results[ep.label] = {
					status: 0,
					latencyMs: latency,
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}

		const total = endpoints.length;
		const allOk = healthyCount === total;
		const someOk = healthyCount > 0;

		return {
			sensorId: this.id,
			status: allOk ? "healthy" : someOk ? "degraded" : "down",
			message: `${healthyCount}/${total} API endpoints healthy`,
			timestamp,
			data: results,
		};
	}
}
