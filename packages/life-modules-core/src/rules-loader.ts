/**
 * Loads a tenant rules-package/ directory into a parsed, typed structure.
 * Convention (matches freelance/<tenant>/rules-package/):
 *   manifest.json                → RulesManifest
 *   taxonomy.json                → taxonomy (optional)
 *   sources.json                 → sources (optional)
 *   policy.yaml                  → policy
 *   rules/*.yaml                 → rules[filename-without-ext]
 *   schemas/*.json               → schemas[filename-without-ext]
 *   prompts/*.liquid             → prompts[filename-without-ext] (raw source, compiled later)
 *   tests/fixtures/*.{json,yaml} → fixtures[filename-without-ext]
 *
 * I/O via node:fs/promises so the package works in both Bun and Node (Next.js runtime).
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { RulesManifestSchema, type RulesManifest, type RulesPackage } from "./types.ts";

async function readJson(p: string): Promise<unknown> {
  const text = await readFile(p, "utf-8");
  return JSON.parse(text);
}

async function readYaml(p: string): Promise<unknown> {
  const text = await readFile(p, "utf-8");
  return YAML.parse(text);
}

async function readText(p: string): Promise<string> {
  return await readFile(p, "utf-8");
}

function stem(filename: string): string {
  return filename.replace(/\.(ya?ml|json|liquid)$/i, "");
}

async function listDir(dir: string, extFilter?: RegExp): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return extFilter ? entries.filter((e) => extFilter.test(e)) : entries;
}

export async function loadRulesPackage(dir: string): Promise<RulesPackage> {
  const abs = path.resolve(dir);

  // manifest — required
  const manifestPath = path.join(abs, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`rules-package missing manifest.json at ${manifestPath}`);
  }
  const manifestRaw = (await readJson(manifestPath)) as unknown;
  const manifest: RulesManifest = RulesManifestSchema.parse(manifestRaw);

  // optional top-level files
  const taxonomyPath = path.join(abs, "taxonomy.json");
  const sourcesPath = path.join(abs, "sources.json");
  const policyPath = path.join(abs, "policy.yaml");
  const taxonomy = existsSync(taxonomyPath)
    ? ((await readJson(taxonomyPath)) as Record<string, unknown>)
    : undefined;
  const sources = existsSync(sourcesPath)
    ? ((await readJson(sourcesPath)) as Record<string, unknown>)
    : undefined;
  const policy = existsSync(policyPath)
    ? ((await readYaml(policyPath)) as Record<string, unknown>)
    : {};

  // rules/*.yaml
  const rules: Record<string, unknown> = {};
  for (const f of await listDir(path.join(abs, "rules"), /\.ya?ml$/i)) {
    rules[stem(f)] = await readYaml(path.join(abs, "rules", f));
  }

  // schemas/*.json
  const schemas: Record<string, unknown> = {};
  for (const f of await listDir(path.join(abs, "schemas"), /\.json$/i)) {
    schemas[stem(f)] = await readJson(path.join(abs, "schemas", f));
  }

  // prompts/*.liquid
  const prompts: Record<string, string> = {};
  for (const f of await listDir(path.join(abs, "prompts"), /\.liquid$/i)) {
    prompts[stem(f)] = await readText(path.join(abs, "prompts", f));
  }

  // tests/fixtures/*.{json,yaml}
  const fixtures: Record<string, unknown> = {};
  const fixturesDir = path.join(abs, "tests", "fixtures");
  for (const f of await listDir(fixturesDir, /\.(json|ya?ml)$/i)) {
    const fp = path.join(fixturesDir, f);
    fixtures[stem(f)] = /\.json$/i.test(f) ? await readJson(fp) : await readYaml(fp);
  }

  return {
    dir: abs,
    manifest,
    taxonomy,
    sources,
    rules,
    schemas,
    prompts,
    policy,
    fixtures,
  };
}
