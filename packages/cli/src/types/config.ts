export interface DaemonConfig {
	heartbeatIntervalMs?: number;
	dashboardPort?: number;
	symphonyUrl?: string;
	arcanUrl?: string;
	lagoUrl?: string;
	autonomicUrl?: string;
	incidentThreshold?: number;
}

export interface AgentConfig {
	agentId?: string;
	publicKey?: string;
	name?: string;
	capabilities?: string[];
	registeredAt?: string;
	status?: string;
}

export interface CliConfig {
	token?: string;
	tokenExpiresAt?: string;
	apiBase?: string;
	defaultFormat?: "table" | "json";
	daemon?: DaemonConfig;
	agent?: AgentConfig;
}
