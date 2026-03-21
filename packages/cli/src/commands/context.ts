import { Command } from "commander";
import { ApiClient } from "../lib/api-client.js";
import { fmt, info, printJson } from "../lib/output.js";

export function contextCommand(): Command {
	const cmd = new Command("context").description(
		"Show project context and conventions",
	);

	cmd
		.command("show")
		.description("Show full context")
		.option("--json", "Output as JSON")
		.action(async (opts) => {
			const client = new ApiClient(cmd.optsWithGlobals());
			const ctx = await client.getContext();

			if (opts.json) {
				printJson(ctx);
				return;
			}

			console.log(fmt.bold(fmt.cyan(ctx.app.name)));
			console.log(fmt.dim(ctx.app.description));

			console.log(`\n${fmt.bold("Conventions")}`);
			for (const [k, v] of Object.entries(ctx.conventions)) {
				info(`${k}: ${v}`);
			}

			console.log(`\n${fmt.bold("Stack")}`);
			for (const [k, v] of Object.entries(ctx.stack)) {
				info(`${k}: ${v}`);
			}

			console.log(`\n${fmt.bold("Features")}`);
			for (const [k, v] of Object.entries(ctx.features)) {
				info(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
			}
		});

	cmd
		.command("conventions")
		.description("Show conventions only")
		.option("--json", "Output as JSON")
		.action(async (opts) => {
			const client = new ApiClient(cmd.optsWithGlobals());
			const ctx = await client.getContext();

			if (opts.json) {
				printJson(ctx.conventions);
				return;
			}

			console.log(fmt.bold("Conventions"));
			for (const [k, v] of Object.entries(ctx.conventions)) {
				info(`${k}: ${v}`);
			}
		});

	cmd
		.command("stack")
		.description("Show tech stack only")
		.option("--json", "Output as JSON")
		.action(async (opts) => {
			const client = new ApiClient(cmd.optsWithGlobals());
			const ctx = await client.getContext();

			if (opts.json) {
				printJson(ctx.stack);
				return;
			}

			console.log(fmt.bold("Stack"));
			for (const [k, v] of Object.entries(ctx.stack)) {
				info(`${k}: ${v}`);
			}
		});

	return cmd;
}
