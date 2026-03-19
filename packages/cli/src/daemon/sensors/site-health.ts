import type { Sensor, SensorContext } from "./index.js";
import type { SensorResult } from "../../types/daemon.js";

export class SiteHealthSensor implements Sensor {
	id = "site-health";
	name = "Site Health";

	async run(ctx: SensorContext): Promise<SensorResult> {
		const timestamp = new Date().toISOString();
		const urls = [
			{ label: "homepage", path: "/" },
			{ label: "prompts-api", path: "/api/prompts" },
		];

		const results: Record<string, unknown> = {};
		let allOk = true;
		let worstLatency = 0;

		for (const { label, path } of urls) {
			const url = `${ctx.apiBase}${path}`;
			const start = Date.now();
			try {
				const res = await fetch(url, {
					signal: AbortSignal.timeout(10_000),
				});
				const latency = Date.now() - start;
				worstLatency = Math.max(worstLatency, latency);
				results[label] = {
					status: res.status,
					latencyMs: latency,
					ok: res.ok,
				};
				if (!res.ok) allOk = false;
			} catch (err) {
				const latency = Date.now() - start;
				worstLatency = Math.max(worstLatency, latency);
				allOk = false;
				results[label] = {
					status: 0,
					latencyMs: latency,
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}

		return {
			sensorId: this.id,
			status: allOk ? "healthy" : "down",
			message: allOk
				? `All ${urls.length} endpoints responding`
				: "One or more endpoints unreachable",
			latencyMs: worstLatency,
			timestamp,
			data: results,
		};
	}
}
