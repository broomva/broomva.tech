import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_DIR, CONFIG_FILE } from "./constants.js";
import type { CliConfig } from "../types/config.js";

const DEFAULT_CONFIG: CliConfig = {};

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function readConfig(): CliConfig {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: CliConfig): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function updateConfig(partial: Partial<CliConfig>): CliConfig {
  const config = { ...readConfig(), ...partial };
  writeConfig(config);
  return config;
}

export function resetConfig(): void {
  writeConfig(DEFAULT_CONFIG);
}

export function getConfigValue<K extends keyof CliConfig>(key: K): CliConfig[K] {
  return readConfig()[key];
}

export function setConfigValue<K extends keyof CliConfig>(
  key: K,
  value: CliConfig[K],
): void {
  updateConfig({ [key]: value });
}
