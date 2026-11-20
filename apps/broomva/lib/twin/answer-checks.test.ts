import { describe, expect, it } from "vitest";
import { checkAnswer, urlsIn } from "./answer-checks";

// Fixtures are verbatim excerpts of real Haiku answers from the Vercel
// previews of PR #301 on 2026-11-20: four that broke a rule, three that kept
// every rule.
const allowedUrls = new Set(["https://github.com/broomva"]);
const hiringEs = "¿Qué haces y cómo puedo contratarte para un proyecto?";

describe("checkAnswer: the live failures", () => {
  it("catches 'Soy Carlos' with no disclosure (preview 2c96878)", () => {
    const answer =
      "Soy Carlos, arquitecto de Agent OS e ingeniero de IA. Construyo plataformas de datos multi-tenant con agentes en producción.\n\n**Para contratar:**\nEscribe a [carlos@broomva.tech](/contact) con:";
    const problems = checkAnswer({ question: hiringEs, answer, allowedUrls });
    expect(problems).toContain("claims to be Carlos");
    expect(problems).toContain("does not open with the AI-double disclosure");
  });

  it("catches the MSc listed as held (preview e1c5ce3)", () => {
    const answer =
      "Soy el doble de IA de Carlos, respondiendo con lo que ha publicado en broomva.tech.\n\nEstá basado en Bogotá, tiene una MSc en Inteligencia Artificial (2026), y piensa en términos de sistemas de control.";
    const problems = checkAnswer({
      question: "¿Quién eres?",
      answer,
      allowedUrls,
    });
    expect(problems.some((p) => p.startsWith("lists the MSc as held"))).toBe(
      true,
    );
  });

  it("catches an invented reason for the unfinished MSc (preview 1af536b)", () => {
    const answer =
      "I'm Carlos's AI double, answering from what he has published.\n\nHe also pursued an **MSc in Artificial Intelligence** at Universidad de los Andes but didn't complete it — he left to build in production instead.";
    const problems = checkAnswer({
      question: "What is your education background?",
      answer,
      allowedUrls,
    });
    expect(problems.some((p) => p.startsWith("gives a reason"))).toBe(true);
  });

  it("catches a guessed company domain (preview 1af536b)", () => {
    const answer =
      "Soy el doble de IA de Carlos, respondiendo con lo que ha publicado aquí en broomva.tech.\n\nAhora lidera la arquitectura en [Stimulus](https://stimulus.ai) (plataformas agentic de procurement).";
    const problems = checkAnswer({
      question: "¿Quién eres?",
      answer,
      allowedUrls,
    });
    expect(problems).toContain(
      "links a URL that is not in its context: https://stimulus.ai",
    );
  });
});

describe("checkAnswer: answers that kept every rule (preview cde6d37)", () => {
  it.each([
    [
      "What is your education background?",
      "I'm Carlos's AI double, answering from what he has published.\n\nCarlos holds a **BSc in Mechatronics Engineering** from Universidad de San Buenaventura (2018). He also pursued an **MSc in Artificial Intelligence** at Universidad de los Andes but did not complete it.\n\nFor the full picture, see [his profile](/profile).",
    ],
    [
      hiringEs,
      "Soy el doble de IA de Carlos, respondo con lo que ha publicado aquí.\n\n**Para contratarlo:** escribe a **carlos@broomva.tech** con:\n- Quién eres y el problema que necesita resolver.\n\nYo no puedo confirmar disponibilidad, tarifas ni fechas de inicio — eso lo decide Carlos directamente.",
    ],
    [
      "What is Lago?",
      "I'm Carlos's AI double, answering from what he has published.\n\nLago is an open-source event-sourced persistence substrate. See more at [/projects/lago](/projects/lago) or on [GitHub](https://github.com/broomva).",
    ],
  ])("passes: %s", (question, answer) => {
    expect(checkAnswer({ question, answer, allowedUrls })).toEqual([]);
  });

  // Live eval on preview cde6d37: "No soy Carlos" was flagged as a claim.
  it("does not read a denial as an identity claim", () => {
    const answer =
      "Soy el doble de IA de Carlos. No soy Carlos, sino un asistente. I'm not Carlos either.";
    expect(
      checkAnswer({ question: "¿Quién eres?", answer, allowedUrls }),
    ).toEqual([]);
  });

  it("does not read 'Carlos's AI double' as an identity claim", () => {
    const answer = "I'm Carlos's AI double. I'm Carlos’s assistant here.";
    expect(
      checkAnswer({ question: "Who are you?", answer, allowedUrls }),
    ).toEqual([]);
  });
});

// Cross-review round 2 (Codex): the rule boundaries, not only the strings
// the previews happened to produce.
describe("checkAnswer: rule boundaries", () => {
  const fails = (question: string, answer: string, problem: string) =>
    expect(
      checkAnswer({ question, answer, allowedUrls }).some((p) =>
        p.startsWith(problem),
      ),
    ).toBe(true);

  it("requires the disclosure in the first sentence, not later", () => {
    fails(
      "Who are you?",
      "Carlos builds agent platforms. I'm Carlos's AI double, answering from his pages.",
      "does not open with the AI-double disclosure",
    );
  });

  it("catches other identity phrasings", () => {
    fails(
      "Who are you?",
      "I'm Carlos's AI double. Me llamo Carlos.",
      "claims to be Carlos",
    );
    fails(
      "Who are you?",
      "I'm Carlos's AI double. My name is Carlos.",
      "claims to be Carlos",
    );
  });

  it("catches the degree under other names", () => {
    fails(
      "Education?",
      "He earned a master's in AI at Los Andes.",
      "lists the MSc as held",
    );
    fails(
      "¿Estudios?",
      "Tiene una maestría en IA de Los Andes.",
      "lists the MSc as held",
    );
    fails(
      "Education?",
      "He holds an M.Sc. in AI from Los Andes.",
      "lists the MSc as held",
    );
  });

  // Cross-review round 3 (Codex).
  it("requires the disclosure to name Carlos", () => {
    fails(
      "Who are you?",
      "I am an AI double.",
      "does not open with the AI-double disclosure",
    );
  });

  it("catches French and Portuguese identity claims, not denials", () => {
    fails("Qui es-tu ?", "Je suis Carlos.", "claims to be Carlos");
    fails("Quem é você?", "Sou o Carlos.", "claims to be Carlos");
    expect(
      checkAnswer({
        question: "Qui es-tu ?",
        answer: "I'm Carlos's AI double; je ne suis pas Carlos.",
        allowedUrls,
      }),
    ).toEqual([]);
  });

  // Live eval on preview cde6d37: a correct answer phrased "it wasn't
  // completed" was flagged as held.
  it("accepts other ways of saying the MSc was not completed", () => {
    for (const answer of [
      "He also pursued an **MSc in Artificial Intelligence** at Universidad de los Andes, though it wasn't completed.",
      "He started an MSc in AI at Los Andes but never finished it.",
      "Empezó una maestría en IA en Los Andes, sin terminar.",
    ]) {
      expect(
        checkAnswer({ question: "Education?", answer, allowedUrls }),
      ).toEqual([]);
    }
  });

  it("catches a reason for the MSc given in the next sentence", () => {
    fails(
      "Education?",
      "Carlos did not complete his MSc. He left to build in production instead.",
      "gives a reason for the unfinished MSc",
    );
  });

  it("allows only exact URLs from the context, in links or bare", () => {
    fails(
      "Lago?",
      "See [code](https://github.com/attacker/malware).",
      "links a URL that is not in its context",
    );
    fails(
      "Lago?",
      "See https://evil.example/x for more.",
      "links a URL that is not in its context",
    );
    expect(
      checkAnswer({
        question: "Lago?",
        answer:
          "On [GitHub](https://github.com/broomva/). Also https://github.com/broomva.",
        allowedUrls,
      }),
    ).toEqual([]);
  });

  it("does not read the CV link text as the degree", () => {
    expect(
      checkAnswer({
        question: "Education?",
        answer: "See his CVs ([master](/cv/carlos-escobar-cv-master.pdf)).",
        allowedUrls,
      }),
    ).toEqual([]);
  });
});

describe("urlsIn", () => {
  it("collects normalized absolute URLs only", () => {
    const urls = urlsIn(
      "See https://github.com/broomva/lago/ and (https://x.com/broomva). Not /profile.",
    );
    expect([...urls].sort()).toEqual([
      "https://github.com/broomva/lago",
      "https://x.com/broomva",
    ]);
  });
});
