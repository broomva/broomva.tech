import { existsSync, readFileSync } from "node:fs";
import { Command } from "commander";
import { Dashboard } from "../daemon/dashboard.js";
import { HeartbeatLoop } from "../daemon/heartbeat.js";
import { DaemonLogger } from "../daemon/logger.js";
import {
	isDaemonRunning,
	removePidFile,
	stopDaemon,
	writePidFile,
} from "../daemon/process.js";
import { ApiHealthSensor } from "../daemon/sensors/api-health.js";
import {
	clearSensors,
	getSensors,
	registerSensor,
} from "../daemon/sensors/index.js";
import { createRailwaySensors } from "../daemon/sensors/railway-health.js";
import { SiteHealthSensor } from "../daemon/sensors/site-health.js";
import { SymphonyHttpClient } from "../daemon/symphony-client.js";
import { resolveToken } from "../lib/auth-store.js";
import { readConfig } from "../lib/config-store.js";
import {
	DAEMON_STATE_FILE,
	DEFAULT_API_BASE,
	DEFAULT_DASHBOARD_PORT,
	DEFAULT_HEARTBEAT_INTERVAL_MS,
} from "../lib/constants.js";
import {
	fmt,
	info,
	error as printError,
	printJson,
	success,
	warn,
} from "../lib/output.js";
import type { DaemonConfig } from "../types/config.js";

// Default local ports for services
const LOCAL_DEFAULTS: Record<string, string> = {
	symphonyUrl: "http://localhost:8080",
	arcanUrl: "http://localhost:8081",
	lagoUrl: "http://localhost:8082",
	autonomicUrl: "http://localhost:8083",
};

function resolveDaemonConfig(opts: {
	env?: string;
	port?: string;
	interval?: string;
	symphonyUrl?: string;
	arcanUrl?: string;
	lagoUrl?: string;
	autonomicUrl?: string;
}): { daemonConfig: DaemonConfig; apiBase: string; envLabel: string } {
	const config = readConfig();
	const savedDaemon = config.daemon ?? {};
	const isLocal = opts.env === "local";
	const envLabel = isLocal ? "local" : "railway";

	const daemonConfig: DaemonConfig = {
		heartbeatIntervalMs: opts.interval
			? Number.parseInt(opts.interval, 10)
			: (savedDaemon.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS),
		dashboardPort: opts.port
			? Number.parseInt(opts.port, 10)
			: (savedDaemon.dashboardPort ?? DEFAULT_DASHBOARD_PORT),
		incidentThreshold: savedDaemon.incidentThreshold,
		symphonyUrl:
			opts.symphonyUrl ??
			(isLocal ? LOCAL_DEFAULTS.symphonyUrl : savedDaemon.symphonyUrl),
		arcanUrl:
			opts.arcanUrl ??
			(isLocal ? LOCAL_DEFAULTS.arcanUrl : savedDaemon.arcanUrl),
		lagoUrl:
			opts.lagoUrl ?? (isLocal ? LOCAL_DEFAULTS.lagoUrl : savedDaemon.lagoUrl),
		autonomicUrl:
			opts.autonomicUrl ??
			(isLocal ? LOCAL_DEFAULTS.autonomicUrl : savedDaemon.autonomicUrl),
	};

	const apiBase = isLocal
		? "http://localhost:3000"
		: (config.apiBase ?? DEFAULT_API_BASE);

	return { daemonConfig, apiBase, envLabel };
}

export function daemonCommand(): Command {
	const cmd = new Command("daemon").description(
		"Manage the broomvad runtime daemon",
	);

	cmd
		.command("start")
		.description("Start the broomvad daemon")
		.option(
			"--env <environment>",
			"Target environment: local or railway",
			"railway",
		)
		.option("--port <port>", "Dashboard port")
		.option("--interval <ms>", "Heartbeat interval in milliseconds")
		.option("--symphony-url <url>", "Symphony service URL override")
		.option("--arcan-url <url>", "Arcan service URL override")
		.option("--lago-url <url>", "Lago service URL override")
		.option("--autonomic-url <url>", "Autonomic service URL override")
		.action(async (opts) => {
			const { running, pid } = isDaemonRunning();
			if (running) {
				printError(`Daemon already running (PID ${pid})`);
				process.exit(1);
			}

			const { daemonConfig, apiBase, envLabel } = resolveDaemonConfig(opts);
			const logger = new DaemonLogger();
			const tokenInfo = resolveToken();

			info(
				`Starting broomvad (env: ${fmt.cyan(envLabel)}, api: ${fmt.dim(apiBase)})`,
			);

			if (!tokenInfo) {
				warn("No auth token found. Authenticated sensors will be limited.");
				warn("Run `broomva auth login` for full monitoring.");
			}

			// Register sensors
			clearSensors();
			registerSensor(new SiteHealthSensor());
			registerSensor(new ApiHealthSensor());
			for (const s of createRailwaySensors()) {
				registerSensor(s);
			}

			// Symphony client
			let symphonyClient: SymphonyHttpClient | null = null;
			if (daemonConfig.symphonyUrl) {
				symphonyClient = new SymphonyHttpClient(
					daemonConfig.symphonyUrl,
					tokenInfo?.token ?? null,
				);
			}

			// Heartbeat loop
			const heartbeat = new HeartbeatLoop({
				sensors: getSensors(),
				config: daemonConfig,
				apiBase,
				logger,
				onTick: (state) => {
					const sensorSummary = Object.values(state.sensors)
						.map((s) => {
							const icon =
								s.status === "healthy"
									? fmt.green("●")
									: s.status === "degraded"
										? fmt.yellow("●")
										: fmt.red("●");
							return `${icon} ${s.sensorId}`;
						})
						.join("  ");

					const openIncidents = state.incidents.filter(
						(i) => i.status === "open",
					).length;

					console.log(
						`${fmt.dim(`[${state.lastTickAt}]`)} tick #${state.tickCount}  ${sensorSummary}${openIncidents > 0 ? fmt.red(`  ${openIncidents} incident(s)`) : ""}`,
					);
				},
			});

			// Dashboard
			const dashboard = new Dashboard({
				port: daemonConfig.dashboardPort ?? DEFAULT_DASHBOARD_PORT,
				logger,
				getState: () => heartbeat.getState(),
				symphonyClient,
			});

			// Write PID and start
			writePidFile(process.pid);
			logger.info("Daemon started", {
				pid: process.pid,
				env: envLabel,
				apiBase,
				dashboardPort: daemonConfig.dashboardPort,
			});

			// Graceful shutdown
			const shutdown = () => {
				info("\nShutting down broomvad...");
				heartbeat.stop();
				dashboard.stop();
				removePidFile();
				logger.info("Daemon stopped");
				process.exit(0);
			};

			process.on("SIGINT", shutdown);
			process.on("SIGTERM", shutdown);

			try {
				await dashboard.start();
				success(
					`Dashboard at http://localhost:${daemonConfig.dashboardPort ?? DEFAULT_DASHBOARD_PORT}`,
				);
			} catch (err) {
				printError(
					`Failed to start dashboard: ${err instanceof Error ? err.message : String(err)}`,
				);
				removePidFile();
				process.exit(1);
			}

			heartbeat.start();

			info(
				`broomvad running (PID ${process.pid}, env: ${envLabel}). Press Ctrl+C to stop.`,
			);

			// Keep alive
			await new Promise(() => {});
		});

	cmd
		.command("stop")
		.description("Stop the broomvad daemon")
		.action(() => {
			const { stopped, pid } = stopDaemon();
			if (stopped) {
				success(`Daemon stopped (PID ${pid})`);
			} else {
				warn("No running daemon found.");
			}
		});

	cmd
		.command("status")
		.description("Show daemon status")
		.option("--json", "Output as JSON")
		.action((opts) => {
			const { running, pid } = isDaemonRunning();

			// Read persisted state
			let state = null;
			if (existsSync(DAEMON_STATE_FILE)) {
				try {
					state = JSON.parse(readFileSync(DAEMON_STATE_FILE, "utf-8"));
				} catch {
					// ignore
				}
			}

			if (opts.json) {
				printJson({ running, pid, state });
				return;
			}

			if (!running) {
				warn("Daemon is not running.");
				if (state) {
					info(
						`Last active: ${state.lastTickAt ?? "unknown"} (${state.tickCount} ticks)`,
					);
				}
				return;
			}

			success(`Daemon running (PID ${pid})`);
			if (state) {
				info(`Started: ${state.startedAt}`);
				info(`Last tick: ${state.lastTickAt} (#${state.tickCount})`);
				info(
					`Symphony: ${state.symphonyConnected ? fmt.green("connected") : fmt.red("disconnected")}`,
				);

				console.log("");
				info(fmt.bold("Sensors:"));
				for (const s of Object.values(
					state.sensors as Record<
						string,
						{
							sensorId: string;
							status: string;
							message: string;
							latencyMs?: number;
						}
					>,
				)) {
					const icon =
						s.status === "healthy"
							? fmt.green("●")
							: s.status === "degraded"
								? fmt.yellow("●")
								: s.status === "down"
									? fmt.red("●")
									: fmt.dim("●");
					const latency =
						s.latencyMs !== undefined ? ` (${s.latencyMs}ms)` : "";
					console.log(`  ${icon} ${s.sensorId}: ${s.message}${latency}`);
				}

				const openIncidents = (
					state.incidents as Array<{ status: string }>
				).filter((i) => i.status === "open");
				if (openIncidents.length > 0) {
					console.log("");
					warn(`${openIncidents.length} open incident(s)`);
				}
			}
		});

	cmd
		.command("logs")
		.description("View daemon logs")
		.option("--lines <n>", "Number of lines to show", "20")
		.option("--level <level>", "Filter by level (debug, info, warn, error)")
		.option("--json", "Output as JSON")
		.action((opts) => {
			const logger = new DaemonLogger();
			const entries = logger.readLines({
				lines: Number.parseInt(opts.lines, 10),
				level: opts.level,
			});

			if (entries.length === 0) {
				info("No log entries found.");
				return;
			}

			if (opts.json) {
				printJson(entries);
				return;
			}

			for (const entry of entries) {
				const levelColor =
					entry.level === "error"
						? fmt.red
						: entry.level === "warn"
							? fmt.yellow
							: entry.level === "info"
								? fmt.cyan
								: fmt.dim;
				const ts = fmt.dim(entry.timestamp);
				const lvl = levelColor(entry.level.toUpperCase().padEnd(5));
				const data = entry.data
					? fmt.dim(` ${JSON.stringify(entry.data)}`)
					: "";
				console.log(`${ts} ${lvl} ${entry.message}${data}`);
			}
		});

	cmd
		.command("tasks")
		.description("Show active incidents")
		.option("--json", "Output as JSON")
		.option("--all", "Include resolved incidents")
		.action((opts) => {
			if (!existsSync(DAEMON_STATE_FILE)) {
				info("No daemon state found. Start the daemon first.");
				return;
			}

			let state: Record<string, unknown>;
			try {
				state = JSON.parse(readFileSync(DAEMON_STATE_FILE, "utf-8"));
			} catch {
				printError("Failed to read daemon state.");
				return;
			}

			let incidents = state.incidents ?? [];
			if (!opts.all) {
				incidents = incidents.filter(
					(i: { status: string }) => i.status === "open",
				);
			}

			if (opts.json) {
				printJson(incidents);
				return;
			}

			if (incidents.length === 0) {
				success("No active incidents.");
				return;
			}

			for (const i of incidents) {
				const statusIcon =
					i.status === "open" ? fmt.red("OPEN") : fmt.green("RESOLVED");
				console.log(`${statusIcon} ${fmt.bold(i.id)} [${i.sensorId}]`);
				console.log(`  ${i.message}`);
				console.log(
					`  Opened: ${i.openedAt}${i.resolvedAt ? ` | Resolved: ${i.resolvedAt}` : ""} | Failures: ${i.consecutiveFailures}`,
				);
				console.log("");
			}
		});

	return cmd;
}
