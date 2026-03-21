import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { ApiClient } from "../lib/api-client.js";
import { clearToken, resolveToken, storeToken } from "../lib/auth-store.js";
import { readConfig } from "../lib/config-store.js";
import { DEFAULT_API_BASE } from "../lib/constants.js";
import {
	fmt,
	info,
	error as printError,
	printJson,
	success,
	warn,
} from "../lib/output.js";

export function authCommand(): Command {
	const cmd = new Command("auth").description("Manage authentication");

	cmd
		.command("login")
		.description("Authenticate with broomva.tech")
		.option("--manual", "Use manual token copy-paste instead of device flow")
		.action(async (opts: { manual?: boolean }) => {
			const config = readConfig();
			const base = config.apiBase ?? DEFAULT_API_BASE;

			if (opts.manual) {
				await manualLogin(base);
			} else {
				await deviceLogin(base);
			}
		});

	cmd
		.command("logout")
		.description("Remove stored credentials")
		.action(() => {
			clearToken();
			success("Logged out. Token removed from ~/.broomva/config.json");
		});

	cmd
		.command("status")
		.description("Show current auth status")
		.option("--json", "Output as JSON")
		.action(async (opts: { json?: boolean }) => {
			const tokenInfo = resolveToken();
			if (!tokenInfo) {
				if (opts.json) {
					printJson({ authenticated: false });
				} else {
					warn("Not authenticated. Run `broomva auth login` to log in.");
				}
				return;
			}

			const config = readConfig();
			const client = new ApiClient({ apiBase: config.apiBase });
			const result = await client.validateToken();

			const status = {
				authenticated: result.valid,
				source: tokenInfo.source,
				expiresAt: tokenInfo.expiresAt ?? null,
			};

			if (opts.json) {
				printJson(status);
			} else if (result.valid) {
				success(`Authenticated (token from ${tokenInfo.source})`);
				if (tokenInfo.expiresAt) {
					info(`Token expires: ${tokenInfo.expiresAt}`);
				}
			} else {
				printError("Token is invalid or expired.");
			}
		});

	cmd
		.command("token")
		.description("Print the current token")
		.action(() => {
			const tokenInfo = resolveToken();
			if (!tokenInfo) {
				printError("No token found. Run `broomva auth login` first.");
				process.exit(1);
			}
			console.log(tokenInfo.token);
		});

	return cmd;
}

/**
 * Device Authorization Grant (RFC 8628).
 * 1. Request a device code from the server.
 * 2. Show the user a URL + code to open in the browser.
 * 3. Poll until the user approves, denies, or the code expires.
 */
async function deviceLogin(base: string): Promise<void> {
	info("Requesting device authorization...\n");

	let deviceResponse: {
		device_code: string;
		user_code: string;
		verification_uri: string;
		verification_uri_complete: string;
		expires_in: number;
		interval: number;
	};

	try {
		const res = await fetch(`${base}/api/auth/device/code`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ client_id: "broomva-cli" }),
		});

		if (!res.ok) {
			const text = await res.text();
			printError(`Failed to request device code: ${res.status} ${text}`);
			info("Falling back to manual login...\n");
			await manualLogin(base);
			return;
		}

		deviceResponse = await res.json();
	} catch (err) {
		printError(
			`Could not reach ${base}: ${err instanceof Error ? err.message : err}`,
		);
		info("Falling back to manual login...\n");
		await manualLogin(base);
		return;
	}

	console.log("");
	console.log(fmt.bold("  Open this URL in your browser:"));
	console.log(`  ${fmt.cyan(deviceResponse.verification_uri)}\n`);
	console.log(fmt.bold("  Then enter this code:"));
	console.log(`  ${fmt.bold(fmt.green(deviceResponse.user_code))}\n`);
	console.log(
		fmt.dim(
			`  Or open the direct link:\n  ${deviceResponse.verification_uri_complete}\n`,
		),
	);
	info("Waiting for authorization...\n");

	const interval = (deviceResponse.interval ?? 5) * 1000;
	const deadline = Date.now() + deviceResponse.expires_in * 1000;

	while (Date.now() < deadline) {
		await sleep(interval);

		try {
			const res = await fetch(`${base}/api/auth/device/token`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					device_code: deviceResponse.device_code,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				}),
			});

			const data = await res.json();

			if (res.ok && data.access_token) {
				storeToken(data.access_token);
				console.log("");
				success(
					"Authenticated successfully! Token stored in ~/.broomva/config.json",
				);
				return;
			}

			if (data.error === "authorization_pending") {
				// Keep polling
				continue;
			}

			if (data.error === "slow_down") {
				// Back off
				await sleep(5000);
				continue;
			}

			if (data.error === "access_denied") {
				console.log("");
				printError("Authorization denied by user.");
				process.exit(1);
			}

			if (data.error === "expired_token") {
				console.log("");
				printError("Device code expired. Please try again.");
				process.exit(1);
			}

			// Unknown error
			printError(`Unexpected response: ${JSON.stringify(data)}`);
			process.exit(1);
		} catch (err) {
			// Network glitch — keep trying
			warn(`Polling error: ${err instanceof Error ? err.message : err}`);
		}
	}

	printError("Device code expired. Please try again.");
	process.exit(1);
}

/**
 * Legacy manual token login (copy from browser).
 */
async function manualLogin(base: string): Promise<void> {
	info("1. Sign in at broomva.tech (email, Google, or GitHub)\n");
	info("   Accounts with the same email are automatically linked.\n");
	info("2. Open this URL to get your API token:\n");
	console.log(`   ${base}/api/auth/api-token\n`);
	info('3. Copy the "token" value and paste it below.\n');

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const token = (await rl.question("Token: ")).trim();
	rl.close();

	if (!token) {
		printError("No token provided.");
		process.exit(1);
	}

	info("Validating token...");
	const client = new ApiClient({ apiBase: base, token });
	const result = await client.validateToken();

	if (!result.valid) {
		printError("Token is invalid or expired.");
		process.exit(1);
	}

	storeToken(token);
	success("Authenticated successfully. Token stored in ~/.broomva/config.json");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
