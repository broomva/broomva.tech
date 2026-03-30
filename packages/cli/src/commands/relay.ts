/**
 * `broomva relay` — manage the relay daemon for remote agent sessions.
 *
 * Connects your local machine to broomva.tech so you can run Claude Code,
 * Codex, or Arcan sessions from the web console.
 *
 * Auth: reuses the token from `broomva auth login`. If already authenticated,
 * `broomva relay start` works immediately — no separate auth step.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { resolveToken } from "../lib/auth-store.js";
import { DEFAULT_API_BASE } from "../lib/constants.js";
import { fmt, info, error as printError, success, warn } from "../lib/output.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const RELAY_CONFIG_DIR = join(homedir(), ".broomva", "relay");
const RELAY_CREDENTIALS = join(RELAY_CONFIG_DIR, "credentials.json");
const RELAY_PID_FILE = join(RELAY_CONFIG_DIR, "relay.pid");
const DEFAULT_RELAY_PORT = 3004;
const DEFAULT_POLL_INTERVAL = 2000;

function ensureRelayDir(): void {
	mkdirSync(RELAY_CONFIG_DIR, { recursive: true });
}

/**
 * Resolve relay auth token. Priority:
 * 1. Relay-specific credentials (~/.broomva/relay/credentials.json)
 * 2. Broomva CLI token (~/.broomva/config.json via resolveToken)
 * 3. Life relay credentials (~/.config/life/relay/credentials.json)
 * 4. BROOMVA_TOKEN env var
 */
function resolveRelayToken(): { token: string; source: string } | null {
	// 1. Relay-specific credentials
	if (existsSync(RELAY_CREDENTIALS)) {
		try {
			const data = JSON.parse(readFileSync(RELAY_CREDENTIALS, "utf-8"));
			if (data.token) return { token: data.token, source: "relay credentials" };
		} catch {}
	}

	// 2. Broomva CLI token
	const cliToken = resolveToken();
	if (cliToken) return { token: cliToken.token, source: `broomva CLI (${cliToken.source})` };

	// 3. Life relay credentials (Rust daemon path)
	const lifeRelayPaths = [
		join(homedir(), "Library", "Application Support", "life", "relay", "credentials.json"),
		join(homedir(), ".config", "life", "relay", "credentials.json"),
	];
	for (const p of lifeRelayPaths) {
		if (existsSync(p)) {
			try {
				const data = JSON.parse(readFileSync(p, "utf-8"));
				if (data.token) return { token: data.token, source: "life relay credentials" };
			} catch {}
		}
	}

	// 4. Env var
	if (process.env.BROOMVA_TOKEN) {
		return { token: process.env.BROOMVA_TOKEN, source: "BROOMVA_TOKEN env" };
	}

	return null;
}

// ─── Commands ────────────────────────────────────────────────────────────────

export function relayCommand(): Command {
	const relay = new Command("relay").description(
		"Manage the relay daemon — connect your machine to broomva.tech for remote agent sessions",
	);

	// ── relay auth ──
	relay
		.command("auth")
		.description("Authenticate relay with broomva.tech (reuses broomva auth login if available)")
		.option("--url <url>", "Server URL", DEFAULT_API_BASE)
		.action(async (opts: { url: string }) => {
			const existing = resolveRelayToken();
			if (existing) {
				success(`Already authenticated (${existing.source})`);
				console.log();
				console.log(`  Token source: ${fmt.dim(existing.source)}`);
				console.log(`  To re-authenticate: ${fmt.cyan("broomva auth login")}`);
				console.log();
				return;
			}

			// No token found — guide user to broomva auth login
			warn("No authentication token found.");
			console.log();
			console.log(`  Run ${fmt.bold("broomva auth login")} to authenticate.`);
			console.log(`  The relay will automatically use your broomva.tech session.`);
			console.log();
		});

	// ── relay start ──
	relay
		.command("start")
		.description("Start the relay daemon (connects to broomva.tech, polls for commands)")
		.option("--server <url>", "Server URL", DEFAULT_API_BASE)
		.option("--port <port>", "Local API port", String(DEFAULT_RELAY_PORT))
		.option("--name <name>", "Node display name")
		.action(async (opts: { server: string; port: string; name?: string }) => {
			const auth = resolveRelayToken();
			if (!auth) {
				printError("Not authenticated. Run `broomva auth login` first.");
				process.exit(1);
			}

			const port = Number.parseInt(opts.port, 10);
			const hostname = opts.name || require("node:os").hostname();

			info(`Starting relay daemon...`);
			console.log(`  Server:   ${fmt.cyan(opts.server)}`);
			console.log(`  Node:     ${fmt.bold(hostname)}`);
			console.log(`  API port: ${port}`);
			console.log(`  Auth:     ${fmt.dim(auth.source)}`);
			console.log();

			ensureRelayDir();

			// Register node
			info("Registering node...");
			try {
				const connectRes = await fetch(`${opts.server}/api/relay/connect`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${auth.token}`,
					},
					body: JSON.stringify({
						name: hostname,
						hostname,
						capabilities: ["claude-code", "codex", "arcan"],
					}),
				});

				if (!connectRes.ok) {
					const err = await connectRes.json().catch(() => ({ error: "Unknown error" }));
					printError(`Node registration failed: ${err.error || connectRes.statusText}`);
					process.exit(1);
				}

				const { nodeId, status } = (await connectRes.json()) as {
					nodeId: string;
					status: string;
				};
				success(`Node ${fmt.bold(status)}: ${fmt.dim(nodeId)}`);

				// Write PID
				writeFileSync(RELAY_PID_FILE, String(process.pid));

				// Start polling loop
				info("Starting command polling loop (Ctrl+C to stop)...");
				console.log();

				// Graceful shutdown
				const shutdown = () => {
					console.log();
					info("Shutting down relay daemon...");
					try {
						if (existsSync(RELAY_PID_FILE))
							require("node:fs").unlinkSync(RELAY_PID_FILE);
					} catch {}
					process.exit(0);
				};
				process.on("SIGINT", shutdown);
				process.on("SIGTERM", shutdown);

				// Poll loop
				let consecutiveErrors = 0;
				while (true) {
					try {
						const pollRes = await fetch(
							`${opts.server}/api/relay/poll?nodeId=${nodeId}`,
							{
								headers: { Authorization: `Bearer ${auth.token}` },
							},
						);

						if (pollRes.ok) {
							consecutiveErrors = 0;
							const { command } = (await pollRes.json()) as {
								command: Record<string, unknown> | null;
							};
							if (command) {
								console.log(
									`  ${fmt.green("→")} Command: ${fmt.bold(String(command.type))} ${fmt.dim(JSON.stringify(command).slice(0, 80))}`,
								);
							}
						} else {
							consecutiveErrors++;
							if (consecutiveErrors > 10) {
								printError("Too many consecutive poll errors. Stopping.");
								process.exit(1);
							}
						}
					} catch (err) {
						consecutiveErrors++;
						if (consecutiveErrors > 10) {
							printError(
								`Connection lost: ${err instanceof Error ? err.message : "unknown"}`,
							);
							process.exit(1);
						}
					}

					await new Promise((r) => setTimeout(r, DEFAULT_POLL_INTERVAL));
				}
			} catch (err) {
				printError(
					`Failed to start: ${err instanceof Error ? err.message : "unknown error"}`,
				);
				process.exit(1);
			}
		});

	// ── relay stop ──
	relay
		.command("stop")
		.description("Stop the relay daemon")
		.action(() => {
			if (!existsSync(RELAY_PID_FILE)) {
				warn("No relay daemon running.");
				return;
			}

			try {
				const pid = Number.parseInt(
					readFileSync(RELAY_PID_FILE, "utf-8").trim(),
					10,
				);
				process.kill(pid, "SIGTERM");
				success(`Sent stop signal to relay daemon (PID ${pid})`);
			} catch {
				warn("Could not stop daemon (may have already exited).");
			}

			try {
				require("node:fs").unlinkSync(RELAY_PID_FILE);
			} catch {}
		});

	// ── relay status ──
	relay
		.command("status")
		.description("Show relay daemon and connection status")
		.option("--json", "Output as JSON")
		.action(async (opts: { json?: boolean }) => {
			const auth = resolveRelayToken();
			const daemonRunning = existsSync(RELAY_PID_FILE);
			let daemonPid: number | null = null;

			if (daemonRunning) {
				try {
					daemonPid = Number.parseInt(
						readFileSync(RELAY_PID_FILE, "utf-8").trim(),
						10,
					);
					process.kill(daemonPid, 0); // check if alive
				} catch {
					daemonPid = null;
				}
			}

			// Check local API health
			let localApiOk = false;
			let version = "";
			try {
				const res = await fetch(`http://127.0.0.1:${DEFAULT_RELAY_PORT}/health`, {
					signal: AbortSignal.timeout(2000),
				});
				if (res.ok) {
					localApiOk = true;
					const body = (await res.json()) as { version?: string };
					version = body.version || "";
				}
			} catch {}

			if (opts.json) {
				console.log(
					JSON.stringify({
						authenticated: !!auth,
						authSource: auth?.source ?? null,
						daemonRunning: !!daemonPid || localApiOk,
						daemonPid,
						localApiPort: DEFAULT_RELAY_PORT,
						version: version || null,
					}),
				);
				return;
			}

			console.log();
			console.log(`  ${fmt.bold("Relay Status")}`);
			console.log(`  ${"─".repeat(30)}`);
			console.log(
				`  Authenticated:  ${auth ? fmt.green("yes") : fmt.red("no")}${auth ? fmt.dim(` (${auth.source})`) : ""}`,
			);
			console.log(
				`  Daemon:         ${daemonPid || localApiOk ? fmt.green("running") : fmt.dim("not running")}${daemonPid ? fmt.dim(` (PID ${daemonPid})`) : ""}`,
			);
			if (version)
				console.log(`  Version:        ${version}`);
			console.log(
				`  Local API:      ${localApiOk ? fmt.green(`http://127.0.0.1:${DEFAULT_RELAY_PORT}`) : fmt.dim("unavailable")}`,
			);
			console.log();

			if (!auth) {
				console.log(
					`  Run ${fmt.bold("broomva auth login")} to authenticate.`,
				);
				console.log();
			} else if (!daemonPid && !localApiOk) {
				console.log(
					`  Run ${fmt.bold("broomva relay start")} to connect this machine.`,
				);
				console.log();
			}
		});

	// ── relay setup (guided) ──
	relay
		.command("setup")
		.description("Guided setup: authenticate and start the relay daemon")
		.action(async () => {
			console.log();
			console.log(`  ${fmt.bold("Relay Setup")}`);
			console.log(`  ${"─".repeat(30)}`);
			console.log();

			// Step 1: Check auth
			const auth = resolveRelayToken();
			if (auth) {
				success(`Step 1: Authenticated (${auth.source})`);
			} else {
				warn("Step 1: Not authenticated");
				console.log(`  Run ${fmt.bold("broomva auth login")} first, then re-run this command.`);
				console.log();
				process.exit(1);
			}

			// Step 2: Check if daemon already running
			let localApiOk = false;
			try {
				const res = await fetch(`http://127.0.0.1:${DEFAULT_RELAY_PORT}/health`, {
					signal: AbortSignal.timeout(2000),
				});
				localApiOk = res.ok;
			} catch {}

			if (localApiOk) {
				success("Step 2: Relay daemon already running");
				console.log();
				console.log(`  Your machine is connected to broomva.tech.`);
				console.log(`  Open ${fmt.cyan("https://broomva.tech/console/relay")} to start a session.`);
				console.log();
				return;
			}

			// Step 3: Guide to start
			info("Step 2: Start the relay daemon");
			console.log();
			console.log(`  Run: ${fmt.bold("broomva relay start")}`);
			console.log();
			console.log(`  This connects your machine to broomva.tech so you can`);
			console.log(`  run Claude Code, Codex, or Arcan sessions from the web console.`);
			console.log();
		});

	return relay;
}
