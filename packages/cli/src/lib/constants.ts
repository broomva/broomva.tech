import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_API_BASE = "https://broomva.tech";
export const CONFIG_DIR = join(homedir(), ".broomva");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const TOKEN_ENV_VAR = "BROOMVA_API_TOKEN";
export const PACKAGE_NAME = "@broomva/cli";
export const BIN_NAME = "broomva";

// Daemon constants
export const DAEMON_PID_FILE = join(CONFIG_DIR, "daemon.pid");
export const DAEMON_LOG_FILE = join(CONFIG_DIR, "daemon.log");
export const DAEMON_STATE_FILE = join(CONFIG_DIR, "daemon-state.json");
export const DEFAULT_DASHBOARD_PORT = 7890;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
export const DEFAULT_INCIDENT_THRESHOLD = 3;
