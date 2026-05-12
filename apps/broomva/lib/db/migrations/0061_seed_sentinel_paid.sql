-- BRO-846: Add a paid-public demo project so the /api/life/run/[project]
-- x402 path can be demonstrated end-to-end without shipping real wallet
-- settlement. Uses the same sentinel-property-ops module, but with a
-- $0.50 per-run price so anonymous callers get a 402 Payment Required
-- with an x402 quote in the body.

INSERT INTO "LifeProject"
  ("slug", "displayName", "description", "ownerKind", "ownerId",
   "moduleTypeId", "visibility", "status", "pricing", "stats")
VALUES
  (
    'sentinel-paid',
    'Sentinel Pro — paid demo',
    'Same audit engine as /life/sentinel, charged via x402 at $0.50 per run. Demonstrates the paywall + human-approval flow. Free for the project owner; external callers must settle via x402.',
    'platform',
    'platform',
    'sentinel-property-ops',
    'public',
    'active',
    '{"model":"per_run","rail":"x402-any","consumerPriceCents":50,"maxCostCents":200,"creatorSharePct":100,"platformFeePct":0,"currency":"USD"}'::jsonb,
    '{"totalRuns":0}'::jsonb
  )
ON CONFLICT ("slug") DO NOTHING;
