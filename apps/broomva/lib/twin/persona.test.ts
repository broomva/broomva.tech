import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { focus, open } from "@/lib/site-data/now";
import { concurrent, ossProjects } from "@/lib/site-data/profile";
import {
  buildPublicBrief,
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
    expect(prompt).toContain("today is 2026-11-20");
    expect(prompt).toContain("none matched");
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

  // The privacy boundary, enforced: every source the double can quote is a
  // public page. Adding an import here publishes it to anonymous visitors, so
  // it must be a deliberate change to this list, reviewed as such.
  it("imports only public site-data modules", () => {
    const src = readFileSync(path.join(__dirname, "persona.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual([
      "@/lib/site-data/now",
      "@/lib/site-data/profile",
    ]);
    expect(src).not.toMatch(/\breadFile|\bfetch\(|process\.env/);
  });
});
