import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/with-auth", () => ({
  withValidation: vi.fn((_schema, handler) => handler),
}));
vi.mock("@/lib/db/swapit-facts", () => ({
  commonsStats: vi.fn(),
  listApprovedSince: vi.fn(),
  scanForbidden: vi.fn(),
  serializeFact: vi.fn(),
  upsertFact: vi.fn(),
}));
vi.mock("@/lib/swapit/rate-limit", () => ({
  checkSwapitWriteRateLimit: vi.fn(),
}));
vi.mock("@/lib/prompts/resolve-auth", () => ({ resolveAuth: vi.fn() }));

import { factSchema } from "./route";

describe("Swapit public fact schema", () => {
  it("rejects undeclared personal-data fields", () => {
    const parsed = factSchema.safeParse({
      kind: "product",
      payload: {
        product_name: "Cleaner",
        item_class: "cleaner",
        email: "person@example.com",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts only URL strings in public evidence", () => {
    expect(
      factSchema.safeParse({
        kind: "product",
        payload: {
          product_name: "Cleaner",
          item_class: "cleaner",
          evidence: ["https://example.com/source"],
        },
      }).success,
    ).toBe(true);

    expect(
      factSchema.safeParse({
        kind: "product",
        payload: {
          product_name: "Cleaner",
          item_class: "cleaner",
          evidence: [{ email: "person@example.com" }],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts only HTTP(S) procurement links", () => {
    const base = {
      kind: "procurement_option" as const,
      payload: {
        alternative: "safer-cleaner",
        retailer: "Example",
        region: "CO",
      },
    };

    expect(
      factSchema.safeParse({
        ...base,
        payload: { ...base.payload, url: "https://example.com/item" },
      }).success,
    ).toBe(true);
    expect(
      factSchema.safeParse({
        ...base,
        payload: { ...base.payload, url: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });
});
