import { TOKEN_ENV_VAR } from "./constants.js";
import { readConfig, updateConfig } from "./config-store.js";

export interface TokenInfo {
  token: string;
  source: "flag" | "env" | "config";
  expiresAt?: string;
}

/**
 * Resolve token from: --token flag > env var > config file.
 */
export function resolveToken(flagToken?: string): TokenInfo | null {
  if (flagToken) {
    return { token: flagToken, source: "flag" };
  }

  const envToken = process.env[TOKEN_ENV_VAR];
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  const config = readConfig();
  if (config.token) {
    if (config.tokenExpiresAt && new Date(config.tokenExpiresAt) < new Date()) {
      return null; // expired
    }
    return { token: config.token, source: "config", expiresAt: config.tokenExpiresAt };
  }

  return null;
}

export function storeToken(token: string, expiresAt?: string): void {
  updateConfig({ token, tokenExpiresAt: expiresAt });
}

export function clearToken(): void {
  updateConfig({ token: undefined, tokenExpiresAt: undefined });
}
