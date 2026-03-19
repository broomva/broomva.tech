import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	DAEMON_STATE_FILE,
	DEFAULT_HEARTBEAT_INTERVAL_MS,
	DEFAULT_INCIDENT_THRESHOLD,
} from "../lib/constants.js";
import { resolveToken } from "../lib/auth-store.js";
import type { DaemonConfig } from "../types/config.js";
import type { HeartbeatState, Incident } from "../types/daemon.js";
import type { Sensor, SensorContext } from "./sensors/index.js";
import { DaemonLogger } from "./logger.js";

export class HeartbeatLoop {
	private sensors: Sensor[];
	private config: DaemonConfig;
	private apiBase: string;
	private logger: DaemonLogger;
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private failureCounts: Map<string, number> = new Map();
	private state: HeartbeatState;
	private onTick?: (state: HeartbeatState) => void;

	constructor(opts: {
		sensors: Sensor[];
		config: DaemonConfig;
		apiBase: string;
		logger: DaemonLogger;
		onTick?: (state: HeartbeatState) => void;
	}) {
		this.sensors = opts.sensors;
		this.config = opts.config;
		this.apiBase = opts.apiBase;
		this.logger = opts.logger;
		this.onTick = opts.onTick;

		// Try to restore state from disk
		this.state = this.loadState() ?? {
			startedAt: new Date().toISOString(),
			lastTickAt: null,
			tickCount: 0,
			sensors: {},
			incidents: [],
			symphonyConnected: false,
		};
	}

	getState(): HeartbeatState {
		return this.state;
	}

	start(): void {
		if (this.intervalId) return;

		const interval =
			this.config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

		this.logger.info("Heartbeat loop starting", {
			intervalMs: interval,
			sensorCount: this.sensors.length,
		});

		// Run immediately, then on interval
		this.tick();
		this.intervalId = setInterval(() => this.tick(), interval);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
			this.logger.info("Heartbeat loop stopped");
		}
	}

	private async tick(): Promise<void> {
		// Re-resolve token on each tick (handles rotation)
		const tokenInfo = resolveToken();
		const token = tokenInfo?.token ?? null;

		const ctx: SensorContext = {
			token,
			config: this.config,
			apiBase: this.apiBase,
		};

		const threshold =
			this.config.incidentThreshold ?? DEFAULT_INCIDENT_THRESHOLD;

		for (const sensor of this.sensors) {
			try {
				const result = await sensor.run(ctx);
				this.state.sensors[sensor.id] = result;

				if (result.status === "healthy") {
					// Reset failure count on recovery
					const prevCount = this.failureCounts.get(sensor.id) ?? 0;
					this.failureCounts.set(sensor.id, 0);

					// Resolve open incident if any
					if (prevCount >= threshold) {
						this.resolveIncident(sensor.id);
					}
				} else if (
					result.status === "down" ||
					result.status === "degraded"
				) {
					const count =
						(this.failureCounts.get(sensor.id) ?? 0) + 1;
					this.failureCounts.set(sensor.id, count);

					if (count >= threshold) {
						this.openIncident(sensor.id, result.message, count);
					}

					this.logger.warn(`Sensor ${sensor.id}: ${result.status}`, {
						message: result.message,
						consecutiveFailures: count,
					});
				}
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : String(err);
				this.logger.error(`Sensor ${sensor.id} threw`, {
					error: msg,
				});
				this.state.sensors[sensor.id] = {
					sensorId: sensor.id,
					status: "down",
					message: `Sensor error: ${msg}`,
					timestamp: new Date().toISOString(),
				};

				const count =
					(this.failureCounts.get(sensor.id) ?? 0) + 1;
				this.failureCounts.set(sensor.id, count);

				if (count >= threshold) {
					this.openIncident(sensor.id, msg, count);
				}
			}
		}

		// Check Symphony connectivity
		this.state.symphonyConnected = Boolean(
			this.state.sensors["railway-symphony"]?.status === "healthy",
		);

		this.state.lastTickAt = new Date().toISOString();
		this.state.tickCount++;

		this.persistState();
		this.onTick?.(this.state);
	}

	private openIncident(
		sensorId: string,
		message: string,
		failures: number,
	): void {
		// Don't duplicate open incidents for the same sensor
		const existing = this.state.incidents.find(
			(i) => i.sensorId === sensorId && i.status === "open",
		);
		if (existing) {
			existing.consecutiveFailures = failures;
			existing.message = message;
			return;
		}

		const incident: Incident = {
			id: `inc-${sensorId}-${Date.now()}`,
			sensorId,
			status: "open",
			message,
			openedAt: new Date().toISOString(),
			consecutiveFailures: failures,
		};

		this.state.incidents.push(incident);
		this.logger.error("Incident opened", {
			incidentId: incident.id,
			sensorId,
			message,
		});
	}

	private resolveIncident(sensorId: string): void {
		for (const incident of this.state.incidents) {
			if (incident.sensorId === sensorId && incident.status === "open") {
				incident.status = "resolved";
				incident.resolvedAt = new Date().toISOString();
				this.logger.info("Incident resolved", {
					incidentId: incident.id,
					sensorId,
				});
			}
		}
	}

	private persistState(): void {
		try {
			writeFileSync(
				DAEMON_STATE_FILE,
				JSON.stringify(this.state, null, 2) + "\n",
				{ mode: 0o600 },
			);
		} catch (err) {
			this.logger.error("Failed to persist state", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	private loadState(): HeartbeatState | null {
		if (!existsSync(DAEMON_STATE_FILE)) return null;
		try {
			const raw = readFileSync(DAEMON_STATE_FILE, "utf-8");
			return JSON.parse(raw) as HeartbeatState;
		} catch {
			return null;
		}
	}
}
