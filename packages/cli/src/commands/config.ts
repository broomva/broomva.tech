import { Command } from "commander";
import {
	getConfigValue,
	readConfig,
	resetConfig,
	setConfigValue,
	updateConfig,
} from "../lib/config-store.js";
import {
	info,
	error as printError,
	printJson,
	success,
} from "../lib/output.js";
import type { CliConfig, DaemonConfig } from "../types/config.js";

const VALID_KEYS: (keyof CliConfig)[] = ["apiBase", "defaultFormat"];

const VALID_DAEMON_KEYS: (keyof DaemonConfig)[] = [
	"heartbeatIntervalMs",
	"dashboardPort",
	"symphonyUrl",
	"arcanUrl",
	"lagoUrl",
	"autonomicUrl",
	"incidentThreshold",
];

const NUMERIC_DAEMON_KEYS: (keyof DaemonConfig)[] = [
	"heartbeatIntervalMs",
	"dashboardPort",
	"incidentThreshold",
];

function setDaemonConfigValue(key: string, value: string): boolean {
	if (!VALID_DAEMON_KEYS.includes(key as keyof DaemonConfig)) return false;
	const config = readConfig();
	const daemon = config.daemon ?? {};
	if (NUMERIC_DAEMON_KEYS.includes(key as keyof DaemonConfig)) {
		(daemon as Record<string, unknown>)[key] = Number.parseInt(value, 10);
	} else {
		(daemon as Record<string, unknown>)[key] = value;
	}
	updateConfig({ daemon });
	return true;
}

export function configCommand(): Command {
	const cmd = new Command("config").description("Manage CLI configuration");

	cmd
		.command("set")
		.description("Set a config value")
		.argument("<key>", `Config key (${VALID_KEYS.join(", ")}, daemon.<key>)`)
		.argument("<value>", "Config value")
		.action((key: string, value: string) => {
			// Handle daemon.* nested keys
			if (key.startsWith("daemon.")) {
				const daemonKey = key.slice("daemon.".length);
				if (setDaemonConfigValue(daemonKey, value)) {
					success(`Set ${key} = ${value}`);
					return;
				}
				printError(
					`Invalid daemon key "${daemonKey}". Valid keys: ${VALID_DAEMON_KEYS.join(", ")}`,
				);
				process.exit(1);
			}

			if (!VALID_KEYS.includes(key as keyof CliConfig)) {
				printError(
					`Invalid key "${key}". Valid keys: ${VALID_KEYS.join(", ")}, daemon.<key>`,
				);
				process.exit(1);
			}
			setConfigValue(key as keyof CliConfig, value as never);
			success(`Set ${key} = ${value}`);
		});

	cmd
		.command("get")
		.description("Get a config value or show all config")
		.argument("[key]", "Config key (omit to show all)")
		.option("--json", "Output as JSON")
		.action((key: string | undefined, opts: { json?: boolean }) => {
			if (key) {
				const val = getConfigValue(key as keyof CliConfig);
				if (opts.json) {
					printJson({ [key]: val ?? null });
				} else {
					info(`${key} = ${val ?? "(not set)"}`);
				}
			} else {
				const config = readConfig();
				if (opts.json) {
					printJson(config);
				} else {
					const entries = Object.entries(config).filter(([k]) =>
						VALID_KEYS.includes(k as keyof CliConfig),
					);
					if (entries.length === 0) {
						info("No configuration set.");
					} else {
						for (const [k, v] of entries) {
							info(`${k} = ${v}`);
						}
					}
				}
			}
		});

	cmd
		.command("reset")
		.description("Reset all configuration to defaults")
		.action(() => {
			resetConfig();
			success("Configuration reset to defaults.");
		});

	return cmd;
}
