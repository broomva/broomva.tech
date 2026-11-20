/**
 * Live eval of the "Ask Carlos" double against a deployment (BRO-3994).
 *
 *   bun run eval:ask https://broomva.tech
 *   VERCEL_AUTOMATION_BYPASS_SECRET=… bun run eval:ask https://<preview>.vercel.app
 *
 * Asks the questions that broke the double on 2026-11-20, plus the core
 * visitor questions, and fails if any answer breaks a rule in
 * lib/twin/answer-checks.ts. Real model calls: spaced to stay under the
 * route's 8-per-minute limit, so a run takes about a minute.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkAnswer, urlsIn } from "../lib/twin/answer-checks";
import { buildPublicBrief } from "../lib/twin/persona";

const QUESTIONS = [
  "Who are you?",
  "What could we build together?",
  "What is Lago?",
  "What is your education background?",
  "¿Quién eres?",
  "¿Qué haces y cómo puedo contratarte para un proyecto?",
  "Hola, ¿estás disponible para un proyecto de agentes en enero?",
];
const SPACING_MS = 8_500;

const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
  console.error("usage: bun run eval:ask <base-url>");
  process.exit(2);
}

const headers: Record<string, string> = { "content-type": "application/json" };
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (bypass) headers["x-vercel-protection-bypass"] = bypass;

const knowledge = readFileSync(
  path.join(import.meta.dirname, "../public/agent-knowledge.json"),
  "utf8",
);
// The deployment's per-question retrieved context is not observable from
// outside, so this allows any URL in the whole public context: a superset.
// A link outside it is certainly invented; one inside may not have been in
// that question's excerpts.
const allowedUrls = urlsIn(`${buildPublicBrief()}\n${knowledge}`);

/** Concatenate the text deltas of an AI SDK UI message stream. */
function streamText(raw: string): string {
  let text = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === "text-delta") text += event.delta;
    if (event.type === "error") text += `[stream error: ${event.errorText}]`;
  }
  return text;
}

const health = await fetch(`${base}/api/ask`, { headers });
const status = (await health.json()) as { knowledgeDocs?: number };
console.log(
  `GET /api/ask → ${health.status} knowledgeDocs=${status.knowledgeDocs}`,
);
const healthy = (status.knowledgeDocs ?? 0) > 0;
let failing = 0;

for (const [i, question] of QUESTIONS.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, SPACING_MS));
  const res = await fetch(`${base}/api/ask`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: question }] },
      ],
    }),
  });
  const raw = await res.text();
  const answer = res.ok ? streamText(raw) : raw;
  const problems = res.ok
    ? checkAnswer({ question, answer, allowedUrls })
    : [`HTTP ${res.status}: ${raw.slice(0, 200)}`];
  if (problems.length > 0) failing += 1;
  console.log(`\n${problems.length ? "FAIL" : "pass"}  ${question}`);
  console.log(`      ${answer.trim().split("\n")[0]?.slice(0, 160)}`);
  for (const p of problems) console.log(`      - ${p}`);
}

console.log(
  `\n${QUESTIONS.length - failing}/${QUESTIONS.length} answers kept every rule`,
);
if (!healthy) console.log("FAIL  knowledgeDocs is not > 0");
process.exit(failing || !healthy ? 1 : 0);
