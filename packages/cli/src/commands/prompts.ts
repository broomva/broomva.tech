import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { ApiClient } from "../lib/api-client.js";
import {
  printJson,
  printTable,
  printPrompt,
  success,
  error as printError,
  info,
} from "../lib/output.js";
import type { PromptDetail } from "../types/api.js";

function getClient(opts: { apiBase?: string; token?: string }): ApiClient {
  return new ApiClient({ apiBase: opts.apiBase, token: opts.token });
}

export function promptsCommand(): Command {
  const cmd = new Command("prompts").description("Manage prompts");

  cmd
    .command("list")
    .description("List available prompts")
    .option("--category <category>", "Filter by category")
    .option("--tag <tag>", "Filter by tag")
    .option("--model <model>", "Filter by model")
    .option("--mine", "Show only your prompts (requires auth)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const client = getClient(cmd.optsWithGlobals());
      const prompts = await client.listPrompts({
        category: opts.category,
        tag: opts.tag,
        model: opts.model,
        mine: opts.mine,
      });

      if (opts.json) {
        printJson(prompts);
        return;
      }

      if (prompts.length === 0) {
        info("No prompts found.");
        return;
      }

      printTable(
        ["Slug", "Title", "Category", "Tags"],
        prompts.map((p) => [
          p.slug,
          p.title,
          p.category ?? "",
          (p.tags ?? []).join(", "),
        ]),
      );
    });

  cmd
    .command("get")
    .description("Get a prompt by slug")
    .argument("<slug>", "Prompt slug")
    .option("--json", "Output as JSON")
    .option("--raw", "Output only the prompt content (no metadata)")
    .action(async (slug: string, opts) => {
      const client = getClient(cmd.optsWithGlobals());
      const prompt = await client.getPrompt(slug);

      if (opts.json) {
        printJson(prompt);
      } else if (opts.raw) {
        console.log(prompt.content);
      } else {
        printPrompt(prompt);
      }
    });

  cmd
    .command("create")
    .description("Create a new prompt")
    .requiredOption("--title <title>", "Prompt title")
    .requiredOption("--content <content>", "Prompt content (or @file to read from file)")
    .option("--summary <summary>", "Short summary")
    .option("--category <category>", "Category")
    .option("--model <model>", "Target model")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--visibility <vis>", "public or private", "private")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const client = getClient(cmd.optsWithGlobals());
      const content = opts.content.startsWith("@")
        ? readFileSync(opts.content.slice(1), "utf-8")
        : opts.content;

      const prompt = await client.createPrompt({
        title: opts.title,
        content,
        summary: opts.summary,
        category: opts.category,
        model: opts.model,
        tags: opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : undefined,
        visibility: opts.visibility,
      });

      if (opts.json) {
        printJson(prompt);
      } else {
        success(`Created prompt: ${prompt.slug}`);
      }
    });

  cmd
    .command("update")
    .description("Update an existing prompt")
    .argument("<slug>", "Prompt slug")
    .option("--title <title>", "New title")
    .option("--content <content>", "New content (or @file to read from file)")
    .option("--summary <summary>", "New summary")
    .option("--category <category>", "New category")
    .option("--model <model>", "New model")
    .option("--tags <tags>", "New comma-separated tags")
    .option("--visibility <vis>", "public or private")
    .option("--json", "Output as JSON")
    .action(async (slug: string, opts) => {
      const client = getClient(cmd.optsWithGlobals());

      const data: Record<string, unknown> = {};
      if (opts.title) data.title = opts.title;
      if (opts.content) {
        data.content = opts.content.startsWith("@")
          ? readFileSync(opts.content.slice(1), "utf-8")
          : opts.content;
      }
      if (opts.summary) data.summary = opts.summary;
      if (opts.category) data.category = opts.category;
      if (opts.model) data.model = opts.model;
      if (opts.tags) data.tags = opts.tags.split(",").map((t: string) => t.trim());
      if (opts.visibility) data.visibility = opts.visibility;

      if (Object.keys(data).length === 0) {
        printError("No fields to update. Provide at least one option.");
        process.exit(1);
      }

      const prompt = await client.updatePrompt(slug, data);

      if (opts.json) {
        printJson(prompt);
      } else {
        success(`Updated prompt: ${prompt.slug}`);
      }
    });

  cmd
    .command("delete")
    .description("Delete a prompt")
    .argument("<slug>", "Prompt slug")
    .action(async (slug: string) => {
      const client = getClient(cmd.optsWithGlobals());
      await client.deletePrompt(slug);
      success(`Deleted prompt: ${slug}`);
    });

  cmd
    .command("pull")
    .description("Pull a prompt to a local file")
    .argument("<slug>", "Prompt slug")
    .option("-o, --output <file>", "Output file path (default: <slug>.md)")
    .action(async (slug: string, opts) => {
      const client = getClient(cmd.optsWithGlobals());
      const prompt = await client.getPrompt(slug);
      const outFile = opts.output ?? `${slug}.md`;

      const frontmatter = buildFrontmatter(prompt);
      writeFileSync(outFile, `${frontmatter}\n${prompt.content}\n`, "utf-8");
      success(`Pulled "${prompt.title}" → ${outFile}`);
    });

  cmd
    .command("push")
    .description("Push a local prompt file to broomva.tech")
    .argument("<file>", "Local markdown file with frontmatter")
    .option("--create", "Create new prompt (default: update existing)")
    .option("--json", "Output as JSON")
    .action(async (file: string, opts) => {
      const client = getClient(cmd.optsWithGlobals());
      const raw = readFileSync(file, "utf-8");
      const { meta, content } = parseFrontmatter(raw);

      if (!meta.title) {
        printError("File must have a `title` in frontmatter.");
        process.exit(1);
      }

      const payload = {
        title: meta.title as string,
        content,
        summary: meta.summary as string | undefined,
        category: meta.category as string | undefined,
        model: meta.model as string | undefined,
        version: meta.version as string | undefined,
        tags: meta.tags as string[] | undefined,
        visibility: (meta.visibility as "public" | "private") ?? "private",
      };

      let prompt: PromptDetail;
      if (opts.create) {
        prompt = await client.createPrompt(payload);
        success(`Created prompt: ${prompt.slug}`);
      } else {
        const slug = (meta.slug as string) ?? slugify(meta.title as string);
        prompt = await client.updatePrompt(slug, payload);
        success(`Updated prompt: ${prompt.slug}`);
      }

      if (opts.json) printJson(prompt);
    });

  return cmd;
}

function buildFrontmatter(p: PromptDetail): string {
  const lines = ["---"];
  lines.push(`title: "${p.title}"`);
  lines.push(`slug: "${p.slug}"`);
  if (p.summary) lines.push(`summary: "${p.summary}"`);
  if (p.category) lines.push(`category: "${p.category}"`);
  if (p.model) lines.push(`model: "${p.model}"`);
  if (p.version) lines.push(`version: "${p.version}"`);
  if (p.tags?.length) lines.push(`tags: [${p.tags.map((t) => `"${t}"`).join(", ")}]`);
  if (p.visibility) lines.push(`visibility: "${p.visibility}"`);
  lines.push("---");
  return lines.join("\n");
}

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw.trim() };

  const meta: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val: unknown = line.slice(idx + 1).trim();

    // strip quotes
    if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    // parse arrays [...]
    if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
      try {
        val = JSON.parse(val.replace(/'/g, '"'));
      } catch {
        // leave as string
      }
    }
    meta[key] = val;
  }

  return { meta, content: match[2].trim() };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
