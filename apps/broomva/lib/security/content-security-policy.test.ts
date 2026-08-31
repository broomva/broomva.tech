import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  GOOGLE_PREFERRED_SOURCES_ORIGIN,
} from "./content-security-policy";

function directive(csp: string, name: string): string {
  const found = csp
    .split("; ")
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) throw new Error(`no ${name} directive in policy: ${csp}`);
  return found;
}

describe("content security policy", () => {
  for (const nodeEnv of ["production", "development"]) {
    describe(nodeEnv, () => {
      const csp = buildContentSecurityPolicy(nodeEnv);

      // The Preferred Sources library is fetched from news.google.com. Drop the
      // origin from script-src and the button never renders.
      it("allows the Preferred Sources library to load", () => {
        expect(directive(csp, "script-src")).toContain(
          GOOGLE_PREFERRED_SOURCES_ORIGIN,
        );
      });

      // The confirmation UI is an iframe on the same origin. frame-src has no
      // fallback here other than `default-src 'self'`, so without an explicit
      // directive the dialog is blocked and the button appears inert.
      it("allows the Preferred Sources dialog iframe", () => {
        expect(directive(csp, "frame-src")).toContain(
          GOOGLE_PREFERRED_SOURCES_ORIGIN,
        );
      });

      it("still refuses framing and arbitrary objects", () => {
        expect(directive(csp, "frame-ancestors")).toBe(
          "frame-ancestors 'none'",
        );
        expect(directive(csp, "object-src")).toBe("object-src 'none'");
        expect(directive(csp, "default-src")).toBe("default-src 'self'");
      });
    });
  }

  it("keeps dev-only relaxations out of the production policy", () => {
    const prod = buildContentSecurityPolicy("production");
    expect(prod).not.toContain("'unsafe-eval'");
    expect(prod).not.toContain("https://unpkg.com");
    expect(prod).toContain("upgrade-insecure-requests");

    const dev = buildContentSecurityPolicy("development");
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});
