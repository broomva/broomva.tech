export type SensorStatus = "healthy" | "degraded" | "down" | "unknown";

export interface SensorResult {
	sensorId: string;
	status: SensorStatus;
	message: string;
	latencyMs?: number;
	timestamp: string;
	data?: Record<string, unknown>;
}

export interface Incident {
	id: string;
	sensorId: string;
	status: "open" | "resolved";
	message: string;
	openedAt: string;
	resolvedAt?: string;
	consecutiveFailures: number;
}

export interface HeartbeatState {
	startedAt: string;
	lastTickAt: string | null;
	tickCount: number;
	sensors: Record<string, SensorResult>;
	incidents: Incident[];
	symphonyConnected: boolean;
}

export interface SymphonyState {
	running: boolean;
	issues?: SymphonyIssue[];
	metrics?: Record<string, unknown>;
}

export interface SymphonyIssue {
	id: string;
	title: string;
	status: string;
	priority?: string;
	createdAt?: string;
}

export interface DaemonLogEntry {
	timestamp: string;
	level: "debug" | "info" | "warn" | "error";
	message: string;
	data?: Record<string, unknown>;
}
