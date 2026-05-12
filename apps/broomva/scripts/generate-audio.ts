#!/usr/bin/env bun
/**
 * Generate TTS audio narration for writing posts.
 *
 * Uses ElevenLabs by default (ELEVENLABS_API_KEY required).
 * Falls back to edge-tts (free, must be installed: pip install edge-tts).
 *
 * Usage:
 *   bun scripts/generate-audio.ts                    # All posts missing audio
 *   bun scripts/generate-audio.ts --slug my-post     # Specific post
 *   bun scripts/generate-audio.ts --force             # Regenerate all
 *   bun scripts/generate-audio.ts --engine edge-tts   # Force edge-tts
 *   bun scripts/generate-audio.ts --engine elevenlabs # Force ElevenLabs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import matter from "gray-matter";

const CONTENT_DIR = path.join(import.meta.dir, "..", "content", "writing");
const AUDIO_DIR = path.join(import.meta.dir, "..", "public", "audio", "writing");

// ElevenLabs config
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_EN = process.env.ELEVENLABS_VOICE_EN || "nPczCjzI2devNBz1zQrb"; // Brian
const ELEVENLABS_VOICE_ES = process.env.ELEVENLABS_VOICE_ES || "nPczCjzI2devNBz1zQrb"; // Brian (multilingual)
const ELEVENLABS_MODEL = "eleven_multilingual_v2";

// edge-tts config
const EDGE_TTS_VOICE_EN = "en-US-AndrewNeural";
const EDGE_TTS_VOICE_ES = "es-CO-GonzaloNeural";

// ── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const forceRegenerate = args.includes("--force");
const targetSlug = args.find((_, i, a) => a[i - 1] === "--slug") || null;
const forceEngine = args.find((_, i, a) => a[i - 1] === "--engine") || null;

// ── Detect engine ───────────────────────────────────────────────────────────
type Engine = "elevenlabs" | "edge-tts";

function detectEngine(): Engine {
  if (forceEngine === "elevenlabs") {
    if (!ELEVENLABS_API_KEY) {
      console.error("✗ --engine elevenlabs requires ELEVENLABS_API_KEY");
      process.exit(1);
    }
    return "elevenlabs";
  }
  if (forceEngine === "edge-tts") return "edge-tts";

  // Auto-detect: prefer ElevenLabs if key is set
  if (ELEVENLABS_API_KEY) return "elevenlabs";

  // Fallback: check if edge-tts is installed
  try {
    execSync("which edge-tts", { stdio: "pipe" });
    return "edge-tts";
  } catch {
    console.error("✗ No TTS engine available. Set ELEVENLABS_API_KEY or install edge-tts (pip install edge-tts)");
    process.exit(1);
  }
}

// ── Text extraction ─────────────────────────────────────────────────────────
function extractText(content: string): string {
  let body = content;

  // Strip code blocks
  body = body.replace(/```[\s\S]*?```/g, "");
  // Strip images
  body = body.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Strip links (keep text)
  body = body.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Headings → sentences
  body = body.replace(/^#{1,6}\s+(.+)/gm, "$1.");
  // Bold/italic → plain
  body = body.replace(/\*\*([^*]*)\*\*/g, "$1");
  body = body.replace(/\*([^*]*)\*/g, "$1");
  // Inline code
  body = body.replace(/`[^`]*`/g, "");
  // HTML tags
  body = body.replace(/<[^>]+>/g, "");
  // Tables
  body = body.replace(/^\|.*\|$/gm, "");
  // Horizontal rules
  body = body.replace(/^---$/gm, "");
  // List markers
  body = body.replace(/^[-*]\s+/gm, "");
  body = body.replace(/^\d+\.\s+/gm, "");
  // Stray frontmatter
  body = body.replace(/^audio:.*$/gm, "");
  // Collapse whitespace
  body = body.replace(/\n{3,}/g, "\n\n");

  return body.trim();
}

// ── Detect language ─────────────────────────────────────────────────────────
function detectLanguage(text: string, tags: string[]): "en" | "es" {
  const spanishTags = ["agentes-AI", "finanzas-personales", "impuestos", "inversión"];
  if (tags.some((t) => spanishTags.includes(t))) return "es";
  // Simple heuristic: check for common Spanish words
  const spanishWords = text.match(/\b(que|los|las|del|una|por|para|como|con|más|pero|este|esta|son|fue|hace)\b/gi);
  const totalWords = text.split(/\s+/).length;
  if (spanishWords && spanishWords.length / totalWords > 0.05) return "es";
  return "en";
}

// ── ElevenLabs generation ───────────────────────────────────────────────────
async function generateElevenLabs(text: string, outputPath: string, lang: "en" | "es"): Promise<boolean> {
  const voiceId = lang === "es" ? ELEVENLABS_VOICE_ES : ELEVENLABS_VOICE_EN;

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const detail = (err as Record<string, unknown>).detail;
    console.error(`  ✗ ElevenLabs API error: ${response.status} — ${JSON.stringify(detail)}`);
    return false;
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
  return true;
}

// ── edge-tts generation ─────────────────────────────────────────────────────
async function generateEdgeTts(text: string, outputPath: string, lang: "en" | "es"): Promise<boolean> {
  const voice = lang === "es" ? EDGE_TTS_VOICE_ES : EDGE_TTS_VOICE_EN;
  const tmpFile = `/tmp/tts-${Date.now()}.txt`;

  await fs.writeFile(tmpFile, text);

  try {
    execSync(`edge-tts --file "${tmpFile}" --voice "${voice}" --write-media "${outputPath}"`, {
      stdio: "pipe",
      timeout: 120_000,
    });
    await fs.unlink(tmpFile).catch(() => {});
    return true;
  } catch (err) {
    console.error(`  ✗ edge-tts failed: ${err}`);
    await fs.unlink(tmpFile).catch(() => {});
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const engine = detectEngine();
  console.log(`TTS engine: ${engine}`);
  if (engine === "elevenlabs") {
    // Check remaining credits
    const subRes = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": ELEVENLABS_API_KEY! },
    });
    if (subRes.ok) {
      const sub = (await subRes.json()) as Record<string, number>;
      const remaining = sub.character_limit - sub.character_count;
      console.log(`Credits: ${sub.character_count.toLocaleString()} / ${sub.character_limit.toLocaleString()} (${remaining.toLocaleString()} remaining)`);
    }
  }
  console.log();

  await fs.mkdir(AUDIO_DIR, { recursive: true });

  const files = (await fs.readdir(CONTENT_DIR)).filter((f) => /\.(md|mdx)$/.test(f));
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const slug = file.replace(/\.(md|mdx)$/, "");
    if (targetSlug && slug !== targetSlug) continue;

    const raw = await fs.readFile(path.join(CONTENT_DIR, file), "utf8");
    const { data, content } = matter(raw);

    if (data.published === false) {
      skipped++;
      continue;
    }

    const audioPath = path.join(AUDIO_DIR, `${slug}.mp3`);
    const audioExists = await fs.access(audioPath).then(() => true).catch(() => false);

    if (audioExists && !forceRegenerate) {
      skipped++;
      continue;
    }

    const text = extractText(content);
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const lang = detectLanguage(text, tags);

    console.log(`${slug} (${text.length.toLocaleString()} chars, ${lang})`);

    const generate = engine === "elevenlabs" ? generateElevenLabs : generateEdgeTts;
    const ok = await generate(text, audioPath, lang);

    if (ok) {
      const stat = await fs.stat(audioPath);
      const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
      console.log(`  ✓ ${sizeMB} MB → public/audio/writing/${slug}.mp3`);

      // Ensure frontmatter has audio field
      if (!data.audio) {
        const audioRef = `/audio/writing/${slug}.mp3`;
        const updatedRaw = raw.replace(/^(---\n[\s\S]*?)(---)/, `$1audio: ${audioRef}\n$2`);
        if (updatedRaw !== raw) {
          await fs.writeFile(path.join(CONTENT_DIR, file), updatedRaw);
          console.log(`  ✓ Added audio field to frontmatter`);
        }
      }
      generated++;
    } else {
      // If ElevenLabs fails, try edge-tts fallback
      if (engine === "elevenlabs") {
        console.log(`  ↳ Falling back to edge-tts...`);
        try {
          execSync("which edge-tts", { stdio: "pipe" });
          const fallbackOk = await generateEdgeTts(text, audioPath, lang);
          if (fallbackOk) {
            const stat = await fs.stat(audioPath);
            const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
            console.log(`  ✓ ${sizeMB} MB → public/audio/writing/${slug}.mp3 (edge-tts fallback)`);
            generated++;
            continue;
          }
        } catch {
          // edge-tts not available
        }
      }
      failed++;
    }
  }

  console.log();
  console.log(`Done: ${generated} generated, ${skipped} skipped, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

main();
