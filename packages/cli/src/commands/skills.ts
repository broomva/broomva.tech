import { execSync } from "node:child_process";
import { Command } from "commander";
import { ApiClient } from "../lib/api-client.js";
import {
  printJson,
  printTable,
  success,
  error as printError,
  info,
  fmt,
} from "../lib/output.js";

export function skillsCommand(): Command {
  const cmd = new Command("skills").description("Browse and install skills");

  cmd
    .command("list")
    .description("List available skills")
    .option("--layer <layer>", "Filter by layer ID")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const client = new ApiClient(cmd.optsWithGlobals());
      const layers = await client.listSkills(opts.layer);

      if (opts.json) {
        printJson(layers);
        return;
      }

      for (const layer of layers) {
        console.log(`\n${fmt.bold(fmt.cyan(layer.name))} ${fmt.dim(`(${layer.id})`)}`);
        console.log(fmt.dim(layer.description));

        printTable(
          ["Slug", "Name", "Description"],
          layer.skills.map((s) => [s.slug, s.name, s.description]),
        );
      }
    });

  cmd
    .command("get")
    .description("Get details for a skill")
    .argument("<slug>", "Skill slug")
    .option("--json", "Output as JSON")
    .action(async (slug: string, opts) => {
      const client = new ApiClient(cmd.optsWithGlobals());
      const skill = await client.getSkill(slug);

      if (opts.json) {
        printJson(skill);
        return;
      }

      console.log(fmt.bold(fmt.cyan(skill.name)));
      console.log(fmt.dim(skill.description));
      console.log(`\nLayer: ${skill.layer}`);
      console.log(`Install: ${fmt.green(skill.installCommand)}`);
      console.log(`URL: ${skill.skillsUrl}`);
    });

  cmd
    .command("install")
    .description("Install a skill (delegates to npx skills add)")
    .argument("<slug>", "Skill slug")
    .action(async (slug: string) => {
      const client = new ApiClient(cmd.optsWithGlobals());
      let installCmd: string;

      try {
        const skill = await client.getSkill(slug);
        installCmd = skill.installCommand;
      } catch {
        // Fallback if API unavailable
        installCmd = `npx skills add broomva/${slug}`;
      }

      info(`Running: ${installCmd}`);
      try {
        execSync(installCmd, { stdio: "inherit" });
        success(`Installed skill: ${slug}`);
      } catch {
        printError(`Failed to install skill: ${slug}`);
        process.exit(1);
      }
    });

  return cmd;
}
