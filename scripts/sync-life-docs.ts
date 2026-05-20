#!/usr/bin/env bun
/**
 * sync-life-docs.ts — Extract ground-truth metrics from the life workspace
 * and patch the docs MDX files so they never drift.
 *
 * Usage:
 *   bun scripts/sync-life-docs.ts [--life-path <path>] [--dry-run] [--check]
 *
 * Options:
 *   --life-path  Path to the life repo root (default: ../core/life relative to this repo)
 *   --dry-run    Print what would change, but don't write anything
 *   --check      Exit non-zero if any file would change (CI mode)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CHECK_MODE = args.includes("--check");

const lifePathArg = args.find((_, i) => args[i - 1] === "--life-path");
const LIFE_ROOT = resolve(lifePathArg ?? join(import.meta.dir, "../../core/life"));
const DOCS_ROOT = resolve(join(import.meta.dir, "../apps/docs/content/docs/life"));

if (!existsSync(LIFE_ROOT)) {
  console.error(`life repo not found at ${LIFE_ROOT}`);
  process.exit(1);
}

// ── Extract ground truth ────────────────────────────────────────────────────

function sh(cmd: string, cwd = LIFE_ROOT): string {
  return execSync(cmd, { cwd, encoding: "utf8" }).trim();
}

const cargoToml = readFileSync(join(LIFE_ROOT, "Cargo.toml"), "utf8");
const version = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown";
const crateCount = Number.parseInt(
  sh('find crates -name "Cargo.toml" -not -path "*/target/*" | wc -l'),
  10,
);

const testCount = Number.parseInt(
  sh('grep -r "#\\[test\\]\\|#\\[tokio::test\\]" crates --include="*.rs" | wc -l'),
  10,
);
const testFileCount = Number.parseInt(
  sh('grep -rl "#\\[test\\]\\|#\\[tokio::test\\]" crates --include="*.rs" | wc -l'),
  10,
);
const loc = Number.parseInt(
  sh('find crates -name "*.rs" | xargs wc -l | tail -1 | awk \'{print $1}\''),
  10,
);

const subsystemCount = [
  "aios", "anima", "arcan", "lago", "praxis", "autonomic",
  "nous", "haima", "spaces", "vigil", "chronos", "inference",
].length;

const metrics = { version, crateCount, testCount, testFileCount, loc, subsystemCount };
console.log("Extracted metrics:", metrics);

// ── Patch targets ───────────────────────────────────────────────────────────

type Patch = { pattern: RegExp; replacement: string };

const overviewPatches: Patch[] = [
  {
    pattern: /The Life Agent OS.*?written in Rust\.\n/,
    replacement: `The Life Agent OS — ${subsystemCount} subsystems modeled after biological primitives, written in Rust.\n`,
  },
  {
    pattern: /with \d+ active subsystems across \d+ crates, totaling over [\d,]+ lines of Rust/,
    replacement: `with ${subsystemCount} active subsystems across ${crateCount} crates, totaling over ${loc.toLocaleString()} lines of Rust`,
  },
  {
    pattern: /\*\*Current metrics:\*\* v[\d.]+ with [\d,]+ test functions across [\d,]+ test files\./,
    replacement: `**Current metrics:** v${version} with ${testCount.toLocaleString()} test functions across ${testFileCount.toLocaleString()} test files.`,
  },
  {
    pattern: /Life is in \*\*v[\d.]+\*\*/,
    replacement: `Life is in **v${version}**`,
  },
];

// ── Apply patches ───────────────────────────────────────────────────────────

let anyChanged = false;

function applyPatches(file: string, patches: Patch[]) {
  if (!existsSync(file)) {
    console.warn(`Skipping missing file: ${file}`);
    return;
  }
  let content = readFileSync(file, "utf8");
  const original = content;

  for (const { pattern, replacement } of patches) {
    content = content.replace(pattern, replacement);
  }

  if (content === original) {
    console.log(`  no change: ${file}`);
    return;
  }

  anyChanged = true;
  console.log(`  patched: ${file}`);

  if (!DRY_RUN && !CHECK_MODE) {
    writeFileSync(file, content, "utf8");
  }
}

applyPatches(join(DOCS_ROOT, "overview.mdx"), overviewPatches);

// ── Write metrics lock file ─────────────────────────────────────────────────

const lockPath = join(import.meta.dir, "../apps/docs/content/life-metrics.json");
const lockContent = JSON.stringify({ ...metrics, updatedAt: new Date().toISOString() }, null, 2) + "\n";
const existingLock = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : "";
const lockChanged = lockContent !== existingLock;

if (lockChanged) {
  anyChanged = true;
  console.log("  patched: life-metrics.json");
  if (!DRY_RUN && !CHECK_MODE) {
    writeFileSync(lockPath, lockContent, "utf8");
  }
}

// ── Result ──────────────────────────────────────────────────────────────────

if (CHECK_MODE && anyChanged) {
  console.error("\nDocs are out of sync with the life workspace. Run: bun scripts/sync-life-docs.ts");
  process.exit(1);
}

console.log(anyChanged ? "\nDone — files updated." : "\nDocs are up to date.");
