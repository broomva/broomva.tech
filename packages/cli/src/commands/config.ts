import { Command } from "commander";
import { readConfig, resetConfig, setConfigValue, getConfigValue } from "../lib/config-store.js";
import { printJson, success, info, error as printError } from "../lib/output.js";
import type { CliConfig } from "../types/config.js";

const VALID_KEYS: (keyof CliConfig)[] = ["apiBase", "defaultFormat"];

export function configCommand(): Command {
  const cmd = new Command("config").description("Manage CLI configuration");

  cmd
    .command("set")
    .description("Set a config value")
    .argument("<key>", `Config key (${VALID_KEYS.join(", ")})`)
    .argument("<value>", "Config value")
    .action((key: string, value: string) => {
      if (!VALID_KEYS.includes(key as keyof CliConfig)) {
        printError(`Invalid key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
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
          const entries = Object.entries(config).filter(([k]) => VALID_KEYS.includes(k as keyof CliConfig));
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
