import "server-only";
import { searchKnowledge } from "@/lib/ai/knowledge/search";
import { loadTwinKnowledge } from "./knowledge";
import type { RetrievedDoc } from "./persona";

// English + Spanish function words. searchKnowledge adds a point for every
// body hit, so without this "what are you working on" matches every document.
const STOPWORDS = new Set(
  `a about an and any are as at be been but by can could did do does for from
  had has have he her him his how i if in into is it its me more my no not of
  on or our so some such tell than that the their them then there these they
  this those to us was we were what when where which who whom why will with
  would you your yours carlos broomva please hi hello hey know thing things
  el la los las un una unos unas y o de del al en con por para que qué como
  cómo cual cuál cuando cuándo donde dónde quien quién quienes es son eres
  soy estas estás está están fue ser hacer haces hace tu tus te mi mis me
  sobre lo le les se su sus muy más mas hola puedes puedo podemos algo eso
  esto esta este`.split(/\s+/),
);

export function keywords(question: string): string[] {
  const terms = question
    .toLowerCase()
    // Split on hyphens too: searchKnowledge strips them, so "multi-tenant"
    // would otherwise become "multitenant" and match nothing.
    .split(/[\s-]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    // The shared scorer matches substrings, so a two-letter term ("os",
    // "ai") hits nearly every document.
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  // Each term is a scan over every document body: dedupe and cap so a
  // 2,000-character question costs about what a normal one does.
  return [...new Set(terms)].slice(0, MAX_TERMS);
}

const MAX_TERMS = 12;
const MAX_DOCS = 4;
const EXCERPT_CHARS = 600;
/** Keyword-only matches below this are noise ("working", "right", "now"). */
const MIN_SCORE = 6;
/** Shorter titles ("AI") would match ordinary words. */
const MIN_TITLE_CHARS = 4;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Public pages most related to the question. Only `writing`, `notes` and
 * `projects` are eligible: the prompt library is templates, not facts.
 *
 * Pages the question names by title ("What is Lago?") come first; then
 * keyword matches that clear MIN_SCORE.
 */
export async function retrieveForQuestion(
  question: string,
): Promise<RetrievedDoc[]> {
  const knowledge = await loadTwinKnowledge();
  const eligible = knowledge.documents.filter((d) => d.kind !== "prompts");
  const q = question.toLowerCase();

  const named: RetrievedDoc[] = eligible
    .filter(
      (d) =>
        d.title.length >= MIN_TITLE_CHARS &&
        new RegExp(
          `(^|[^\\p{L}\\p{N}])${escapeRegExp(d.title.toLowerCase())}($|[^\\p{L}\\p{N}])`,
          "u",
        ).test(q),
    )
    // Projects are the canonical page for a name; writing can share it.
    .sort(
      (a, b) => Number(b.kind === "projects") - Number(a.kind === "projects"),
    )
    .map((d) => ({
      title: d.title,
      url: d.url,
      summary: d.summary,
      excerpt: d.body.slice(0, EXCERPT_CHARS),
    }));

  const terms = keywords(question);
  const matched: RetrievedDoc[] =
    terms.length === 0
      ? []
      : searchKnowledge(knowledge, terms.join(" "), { maxResults: 12 })
          .filter((r) => r.kind !== "prompts" && r.score >= MIN_SCORE)
          .map((r) => ({
            title: r.title,
            url: r.url,
            summary: r.summary,
            excerpt: (r.excerpts[0] ?? "").slice(0, EXCERPT_CHARS),
          }));

  const seen = new Set<string>();
  return [...named, ...matched]
    .filter((d) => !seen.has(d.url) && seen.add(d.url))
    .slice(0, MAX_DOCS);
}
