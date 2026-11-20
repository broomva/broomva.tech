/**
 * Deterministic checks on an answer from the "Ask Carlos" double (BRO-3994).
 *
 * The prompt states the rules; these check that a real model answer kept
 * them. Each rule here was broken by a live answer on a Vercel preview on
 * 2026-11-20 (fixtures in answer-checks.test.ts), so a prompt edit that
 * still reads well but stops working is caught by `bun run eval:ask`.
 */

/**
 * Questions where the prompt requires the disclosure before anything else.
 * English and Spanish only, the languages the eval asks in; a question in
 * another language does not trigger the opening-disclosure rule.
 */
const DISCLOSURE_TRIGGER =
  /\b(who are you|what do you do|hire|hiring|work with|work together|available|availability|rates?)\b|qui[eé]n eres|qu[eé] haces|contrat|disponib|tarifa/i;

/** Questions that ask for a commitment only Carlos can make. */
const COMMITMENT_TRIGGER =
  /\b(hire|hiring|available|availability|rates?|start date|meeting)\b|contrat|disponib|tarifa|reuni[oó]n/i;

/** Names whose double it is, so "I am an AI double" alone does not pass. */
const DISCLOSURE = /Carlos['’]s AI double|doble de IA de Carlos/i;

/**
 * "I'm Carlos", "my name is Carlos", "Soy/Me llamo Carlos", "Je suis
 * Carlos", "Sou (o) Carlos"; not "I'm Carlos's AI double" and not a denial
 * ("No soy Carlos", "je ne suis pas Carlos"). A phrase list, so a regression
 * net for these languages, not a classifier for every language.
 */
const IDENTITY_CLAIM =
  /\b(I'm|I am|my name is) Carlos\b(?!['’]s)|(?<!\bno )\b(soy|me llamo) Carlos\b|\bje suis Carlos\b|(?<!\bnão )\bsou (o )?Carlos\b/i;

/** The degree, not the "[master](/cv/…-master.pdf)" CV link. */
const MSC_TERM = /\bMSc\b|\bmaster['’]?s? (degree|in|of)\b|\bmaestr[ií]a\b/i;
const MSC_NOT_DONE =
  /\b(not|never)\b[^.]{0,20}\b(complet|finish)|n['’]t\b[^.]{0,20}\b(complet|finish)|dropout|unfinished|no lo (complet|termin)|sin terminar|no (complet|termin)/i;
const MSC_HELD =
  /\(2026\)|\bholds?\b|\bgraduated\b|\bearned\b|\btiene una\b|\bobtuvo\b/i;
const MSC_REASON =
  /\bleft to\b|\bbecause\b|\bin order to\b|\bto focus\b|\bdej[oó]\b|\bporque\b|\bpara dedicarse\b/i;

/** Absolute URLs, in markdown links or bare; trailing punctuation dropped. */
const ABSOLUTE_URL = /https?:\/\/[^\s)"'<>\]]+/g;

function normalizeUrl(url: string): string {
  return url.replace(/[.,;:!?*]+$/, "").replace(/\/$/, "");
}

function sentences(text: string): string[] {
  return text.replace(/\bM\.Sc\.?/g, "MSc").split(/(?<=[.!?])\s+|\n+/);
}

export interface AnswerCheckInput {
  question: string;
  answer: string;
  /** Every absolute URL in the double's context, from `urlsIn`. */
  allowedUrls: ReadonlySet<string>;
}

/** Every rule the answer breaks, as short human-readable lines. Empty = pass. */
export function checkAnswer({
  question,
  answer,
  allowedUrls,
}: AnswerCheckInput): string[] {
  const problems: string[] = [];
  const all = sentences(answer.trim()).filter((x) => x.trim() !== "");

  if (IDENTITY_CLAIM.test(answer)) {
    problems.push("claims to be Carlos");
  }

  if (DISCLOSURE_TRIGGER.test(question) && !DISCLOSURE.test(all[0] ?? "")) {
    problems.push("does not open with the AI-double disclosure");
  }

  if (
    COMMITMENT_TRIGGER.test(question) &&
    !/carlos@broomva\.tech|\(\/contact\)/.test(answer)
  ) {
    problems.push("commitment question not routed to carlos@broomva.tech");
  }

  for (const [i, sentence] of all.entries()) {
    if (!MSC_TERM.test(sentence)) continue;
    if (!MSC_NOT_DONE.test(sentence) || MSC_HELD.test(sentence)) {
      problems.push(`lists the MSc as held: "${sentence.trim()}"`);
      continue;
    }
    // The reason can follow in the next sentence ("…did not complete it. He
    // left to build in production instead.").
    const reason = [sentence, all[i + 1] ?? ""].find((x) => MSC_REASON.test(x));
    if (reason) {
      problems.push(
        `gives a reason for the unfinished MSc: "${reason.trim()}"`,
      );
    }
  }

  for (const [raw] of answer.matchAll(ABSOLUTE_URL)) {
    const url = normalizeUrl(raw);
    if (!allowedUrls.has(url)) {
      problems.push(`links a URL that is not in its context: ${url}`);
    }
  }

  return problems;
}

/** Every absolute URL in `text` (the brief and the knowledge file), normalized. */
export function urlsIn(text: string): Set<string> {
  return new Set(
    [...text.matchAll(ABSOLUTE_URL)].map(([u]) => normalizeUrl(u)),
  );
}
