import { Command } from "commander";
import { authCommand } from "./commands/auth.js";
import { configCommand } from "./commands/config.js";
import { contextCommand } from "./commands/context.js";
import { daemonCommand } from "./commands/daemon.js";
import { promptsCommand } from "./commands/prompts.js";
import { relayCommand } from "./commands/relay.js";
import { skillsCommand } from "./commands/skills.js";
import { readConfig } from "./lib/config-store.js";
import { CliError } from "./lib/errors.js";
import { error as printError, setNoColor } from "./lib/output.js";

export function createProgram(): Command {
	const program = new Command();

	program
		.name("broomva")
		.description("CLI for broomva.tech — prompts, skills, and context")
		.version("0.1.0")
		.option("--api-base <url>", "API base URL")
		.option("--token <token>", "API token")
		.option("--no-color", "Disable color output")
		.hook("preAction", (_thisCommand, actionCommand) => {
			const opts = actionCommand.optsWithGlobals();
			if (opts.color === false) setNoColor(true);

			// Inject apiBase from config if not set via flag
			if (!opts.apiBase) {
				const config = readConfig();
				if (config.apiBase) {
					actionCommand.setOptionValue("apiBase", config.apiBase);
				}
			}
		});

	program.addCommand(authCommand());
	program.addCommand(promptsCommand());
	program.addCommand(skillsCommand());
	program.addCommand(contextCommand());
	program.addCommand(configCommand());
	program.addCommand(daemonCommand());
	program.addCommand(relayCommand());

	return program;
}

export async function run(argv: string[]): Promise<void> {
	const program = createProgram();

	try {
		await program.parseAsync(argv);
	} catch (err) {
		if (err instanceof CliError) {
			printError(err.message);
			process.exit(err.exitCode);
		}
		throw err;
	}
}
