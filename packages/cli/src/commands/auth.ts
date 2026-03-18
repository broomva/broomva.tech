import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { resolveToken, storeToken, clearToken } from "../lib/auth-store.js";
import { ApiClient } from "../lib/api-client.js";
import { DEFAULT_API_BASE } from "../lib/constants.js";
import { success, error as printError, info, warn, printJson } from "../lib/output.js";
import { readConfig } from "../lib/config-store.js";

export function authCommand(): Command {
  const cmd = new Command("auth").description("Manage authentication");

  cmd
    .command("login")
    .description("Authenticate with broomva.tech")
    .action(async () => {
      const config = readConfig();
      const base = config.apiBase ?? DEFAULT_API_BASE;

      info(`Open this URL in your browser to get an API token:\n`);
      console.log(`  ${base}/api/auth/api-token\n`);
      info("Log in if needed, then copy the token and paste it below.\n");

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
