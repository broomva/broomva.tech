import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_API_BASE = "https://broomva.tech";
export const CONFIG_DIR = join(homedir(), ".broomva");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const TOKEN_ENV_VAR = "BROOMVA_API_TOKEN";
export const PACKAGE_NAME = "@broomva/cli";
export const BIN_NAME = "broomva";
