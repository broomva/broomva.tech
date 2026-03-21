export interface DaemonConfig {
	heartbeatIntervalMs?: number;
	dashboardPort?: number;
	symphonyUrl?: string;
	arcanUrl?: string;
	lagoUrl?: string;
	autonomicUrl?: string;
	incidentThreshold?: number;
}

export interface CliConfig {
	token?: string;
	tokenExpiresAt?: string;
	apiBase?: string;
	defaultFormat?: "table" | "json";
	daemon?: DaemonConfig;
}
