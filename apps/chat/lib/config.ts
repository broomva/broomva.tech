import userConfig from "@/chat.config";
import type { ActiveGatewayType } from "./ai/app-model-id";
import { type Config, configSchema, type ModelsConfig } from "./config-schema";

type ActiveModelsConfig = Extract<ModelsConfig, { gateway: ActiveGatewayType }>;

/** Config with the `models` field narrowed to the active gateway. */
type ActiveConfig = Omit<Config, "models"> & { models: ActiveModelsConfig };

/**
 * Parsed configuration with defaults applied.
 * Import this for runtime access to config values.
 *
 * @example
 * import { config } from "@/lib/config";
 * console.log(config.appName);
 */
export const config = configSchema.parse(userConfig) as ActiveConfig;

export type { Config } from "./config-schema";
