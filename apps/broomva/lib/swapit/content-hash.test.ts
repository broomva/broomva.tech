import { describe, expect, it } from "vitest";

import { computeFactId, scanForbidden } from "./content-hash";
import vectors from "./parity-vectors.json";

/**
 * Cross-language content-hash parity.
 *
 * These pinned vectors are byte-identical to the swapit skill's
 * `tests/parity_vectors.json` (Python `anonymize._content_hash`). If TS and Python ever derive
 * different ids for the same fact, identical contributions from different users would get
 * different ids and corroboration/dedup would silently break — so this is a hard gate.
 *
 * Keep the two vector files in sync: any change here must be mirrored in the skill repo
 * (broomva/skills → skills/swapit/tests/parity_vectors.json) and vice-versa.
 */
describe("swapit content-hash parity (TS ↔ Python)", () => {
  for (const v of vectors) {
    it(`reproduces pinned id for ${v.kind} (${v.id})`, () => {
      expect(computeFactId(v.kind, v.payload)).toBe(v.id);
    });
  }

  it("normalizes region to upper before hashing (defensive)", () => {
    const lower = computeFactId("procurement_option", {
      alternative: "cast-iron-skillet",
      retailer: "Lodge",
      region: "co",
    });
    expect(lower).toBe("fact_050479ca65534687"); // == the uppercase 'CO' vector
  });

  it("region is part of the procurement key (different region → different id)", () => {
    const us = computeFactId("procurement_option", {
      alternative: "a",
      retailer: "r",
      region: "US",
    });
    const de = computeFactId("procurement_option", {
      alternative: "a",
      retailer: "r",
      region: "DE",
    });
    expect(us).not.toBe(de);
  });
});

describe("swapit privacy backstop (server scan)", () => {
  it("rejects a procurement offer carrying the private vendor/cost", () => {
    expect(
      scanForbidden({
        alternative: "a",
        retailer: "r",
        region: "US",
        vendor: "MyStore",
        cost: 30,
      }),
    ).toEqual(expect.arrayContaining(["payload.vendor", "payload.cost"]));
  });

  it("passes a clean procurement offer (retailer/price_*)", () => {
    expect(
      scanForbidden({
        alternative: "a",
        retailer: "r",
        region: "US",
        price_min: 20,
        price_max: 30,
      }),
    ).toEqual([]);
  });
});
