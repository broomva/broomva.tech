import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { focus, open } from "@/lib/site-data/now";
import { concurrent, ossProjects } from "@/lib/site-data/profile";
import {
  buildPublicBrief,
  buildTwinSystemParts,
  buildTwinSystemPrompt,
  CONTACT_EMAIL,
} from "./persona";

describe("persona brief", () => {
  it("is built from the same data /profile and /now render", () => {
    const brief = buildPublicBrief();
    for (const role of concurrent) expect(brief).toContain(role.org);
    for (const p of ossProjects) expect(brief).toContain(p.name);
    for (const item of [...focus, ...open]) expect(brief).toContain(item);
    expect(brief).toContain("/contact");
    expect(brief).toContain(CONTACT_EMAIL);
  });

  it("carries the honesty rules and today's date", () => {
    const prompt = buildTwinSystemPrompt({
      retrieved: [],
      today: "2026-11-20",
    });
    expect(prompt).toContain("You are an AI double, not Carlos");
    expect(prompt).toContain("Never invent");
    // Live dogfood 2026-11-20: a Spanish hiring question got "Soy Carlos…"
    // with no disclosure. The identity guard and the localized opening
    // disclosure must both reach the model.
    expect(prompt).toContain("Never claim to be Carlos, in any language");
    expect(prompt).toContain("Soy el doble de IA de Carlos");
    expect(prompt).toMatch(/how to hire or work with Carlos, open with that/);
    expect(prompt).not.toContain("First person, as Carlos");
    expect(prompt).toContain("today is 2026-11-20");
    expect(prompt).toContain("none matched");
  });

  // Owner, 2026-11-19: the Los Andes MSc was not completed. The double
  // repeated "MSc ... (2026)" from these sources in live dogfood (2026-11-20).
  it("never lists the MSc as held, in the brief or its public sources", () => {
    const prompt = buildTwinSystemPrompt({
      retrieved: [],
      today: "2026-11-20",
    });
    expect(prompt).toContain("(dropout");
    expect(prompt).toContain("give no reason for leaving");
    expect(prompt).toContain("never guess a company's domain");
    const sources = [
      prompt,
      readFileSync(
        path.join(__dirname, "../../content/agent/identity.mdx"),
        "utf8",
      ),
      readFileSync(
        path.join(__dirname, "../../app/(site)/profile/page.tsx"),
        "utf8",
      ),
    ];
    for (const s of sources) {
      expect(s).not.toMatch(/MSc[^.\n"]*\(2026\)|MSc AI at Universidad/);
    }
  });

  it("includes retrieved excerpts with their URLs", () => {
    const prompt = buildTwinSystemPrompt({
      retrieved: [
        {
          title: "Life",
          url: "/projects/life",
          summary: "Rust Agent OS",
          excerpt: "Arcan runtime and Lago persistence",
        },
      ],
      today: "2026-11-20",
    });
    expect(prompt).toContain("### Life — /projects/life");
    expect(prompt).toContain("Arcan runtime and Lago persistence");
  });

  it("keeps staticPrompt byte-identical across questions for prompt caching", () => {
    const a = buildTwinSystemParts({ retrieved: [], today: "2026-11-27" });
    const b = buildTwinSystemParts({
      retrieved: [
        {
          title: "Life",
          url: "/projects/life",
          summary: "Rust Agent OS",
          excerpt: "Arcan runtime",
        },
      ],
      today: "2026-11-27",
    });
    expect(a.staticPrompt).toBe(b.staticPrompt);
    expect(a.staticPrompt).not.toContain("### Life — /projects/life");
    expect(b.dynamicContext).toContain("### Life — /projects/life");
    expect(`${b.staticPrompt}\n\n${b.dynamicContext}`).toBe(
      buildTwinSystemPrompt({
        retrieved: [
          {
            title: "Life",
            url: "/projects/life",
            summary: "Rust Agent OS",
            excerpt: "Arcan runtime",
          },
        ],
        today: "2026-11-27",
      }),
    );
  });

  // The privacy boundary, enforced: every source the double can quote is a
  // public page. Adding an import here publishes it to anonymous visitors, so
  // it must be a deliberate change to this list, reviewed as such.
  it("imports only public site-data modules", () => {
    const src = readFileSync(path.join(__dirname, "persona.ts"), "utf8");
    // Every import form: `from "x"`, side-effect `import "x"`, `import("x")`
    // and `require("x")`.
    const specifiers = [
      ...src.matchAll(
        /(?:from\s+|import\s*\(?\s*|require\s*\(\s*)["']([^"']+)["']/g,
      ),
    ].map((m) => m[1]);
    expect([...new Set(specifiers)].sort()).toEqual([
      "@/lib/site-data/now",
      "@/lib/site-data/profile",
    ]);
    expect(src).not.toMatch(/\breadFile|\bfetch\(|process\.env/);
  });
});
