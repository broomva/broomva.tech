import { createHash } from "node:crypto";

/**
 * Pure content-addressing + privacy-scan helpers for the swapit commons.
 *
 * Kept dependency-free (no `server-only`, no db) so the id derivation can be unit-tested
 * and, crucially, verified byte-identical to the Python client's `anonymize._content_hash`
 * — if the two diverge, identical facts from different users would get different ids and
 * corroboration/dedup would silently break.
 */

// Inventory-structural fields that must NEVER appear in a contribution — mirrors the
// client's `anonymize.CONTRIBUTION_FORBIDDEN`. Kept in lockstep (see the skill's
// tests/test_anonymize.py::test_client_server_forbidden_sets_match philosophy).
export const FORBIDDEN_FIELDS: ReadonlySet<string> = new Set([
  "room",
  "quantity",
  "acquired",
  "notes",
  "photos",
  "cost",
  "vendor",
  "procurer_report_ref",
  "checklist",
  "bookmarks",
  "usage",
  "food_contact",
  "heat",
  "child_contact",
  "frequency",
  "status",
  "owner",
  "location",
  "household",
  "purchased",
]);

export function scanForbidden(value: unknown, path = "payload"): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      hits.push(...scanForbidden(v, `${path}[${i}]`));
    });
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_FIELDS.has(k)) {
        hits.push(`${path}.${k}`);
      }
      hits.push(...scanForbidden(v, `${path}.${k}`));
    }
  }
  return hits;
}

/** Serialize exactly like Python's `json.dumps(obj, sort_keys=True, ensure_ascii=False)`. */
export function pyJson(v: unknown): string {
  if (v === null || v === undefined) {
    return "null";
  }
  if (typeof v === "string") {
    return JSON.stringify(v);
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (typeof v === "number") {
    return String(v);
  }
  if (Array.isArray(v)) {
    return `[${v.map(pyJson).join(", ")}]`;
  }
  const o = v as Record<string, unknown>;
  const body = Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}: ${pyJson(o[k])}`)
    .join(", ");
  return `{${body}}`;
}

function asSortedStrings(v: unknown): string[] {
  return Array.isArray(v) ? [...(v as string[])].sort() : [];
}

/** Recompute the content-addressed fact id from `(kind, payload)` — must match
 * `anonymize._content_hash` in the Python client. */
export function computeFactId(
  kind: string,
  payload: Record<string, unknown>,
): string {
  let key: Record<string, unknown>;
  if (kind === "product") {
    key = {
      gtin: payload.gtin ?? null,
      product_name: payload.product_name ?? null,
      brand: payload.brand ?? null,
      item_class: payload.item_class ?? null,
      observed_hazards: asSortedStrings(payload.observed_hazards),
    };
  } else if (kind === "item_class_hazard") {
    key = {
      item_class: payload.item_class ?? null,
      hazard_id: payload.hazard_id ?? null,
    };
  } else {
    key = {
      name: payload.name ?? null,
      replaces: asSortedStrings(payload.replaces),
      avoids_hazards: asSortedStrings(payload.avoids_hazards),
    };
  }
  const blob = pyJson({ kind, ...key });
  return `fact_${createHash("sha256").update(blob, "utf8").digest("hex").slice(0, 16)}`;
}
