export interface CliConfig {
  token?: string;
  tokenExpiresAt?: string;
  apiBase?: string;
  defaultFormat?: "table" | "json";
}
