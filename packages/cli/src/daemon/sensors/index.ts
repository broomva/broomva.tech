import type { DaemonConfig } from "../../types/config.js";
import type { SensorResult } from "../../types/daemon.js";

export interface SensorContext {
	token: string | null;
	config: DaemonConfig;
	apiBase: string;
}

export interface Sensor {
	id: string;
	name: string;
	run(ctx: SensorContext): Promise<SensorResult>;
}

const registry: Sensor[] = [];

export function registerSensor(sensor: Sensor): void {
	registry.push(sensor);
}

export function getSensors(): Sensor[] {
	return [...registry];
}

export function clearSensors(): void {
	registry.length = 0;
}
