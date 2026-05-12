-- BRO-846: Seed the Life Runtime platform — reserved slugs, module types,
-- and Broomva-owned Sentinel/Materiales projects at /life/sentinel + /life/materiales.

-- ---------------------------------------------------------------------------
-- Reserved slugs (platform routes that cannot be claimed as project slugs)
-- ---------------------------------------------------------------------------
INSERT INTO "LifeReservedSlug" ("slug", "reason") VALUES
  ('new',       'wizard-route'),
  ('templates', 'gallery-route'),
  ('pricing',   'marketing'),
  ('docs',      'docs-route'),
  ('help',      'support'),
  ('admin',     'platform'),
  ('api',       'api'),
  ('settings',  'account'),
  ('account',   'account'),
  ('login',     'auth'),
  ('signup',    'auth'),
  ('logout',    'auth'),
  ('search',    'discovery'),
  ('explore',   'discovery'),
  ('featured',  'discovery')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Module types (runner registry)
-- ---------------------------------------------------------------------------
INSERT INTO "LifeModuleType"
  ("id", "version", "displayName", "description", "runnerRef",
   "inputSchema", "outputSchema", "requiredTools", "costEstimateCents")
VALUES
  (
    'sentinel-property-ops',
    '1.0.0',
    'Sentinel — property-ops audit',
    'Work-order audit agent: detects duplicates, weak closures, follow-up risk, missing evidence.',
    '@broomva/sentinel-property-ops',
    '{"type":"object","required":["workOrders"],"properties":{"workOrders":{"type":"array","items":{"type":"object"}}}}'::jsonb,
    '{"type":"object","required":["alerts","summary"],"properties":{"alerts":{"type":"array"},"summary":{"type":"object"}}}'::jsonb,
    '[]'::jsonb,
    '{"avg":15,"p95":40}'::jsonb
  ),
  (
    'materiales-intel',
    '1.0.0',
    'Materiales Intel — precio unitario',
    'Live construction-material price research over Colombian supplier panel with Claude web_search.',
    '@broomva/materiales-intel',
    '{"type":"object","required":["family","item"],"properties":{"family":{"type":"string"},"item":{"type":"string"},"quantity":{"type":"number"},"unit":{"type":"string"},"region":{"type":"string"},"mode":{"type":"string","enum":["fast","standard","deep"]}}}'::jsonb,
    '{"type":"object","required":["suppliers"],"properties":{"suppliers":{"type":"array"},"medianUnitPriceCop":{"type":"number"},"spread":{"type":"number"}}}'::jsonb,
    '["web_search"]'::jsonb,
    '{"avg":30,"p95":120}'::jsonb
  ),
  (
    'generic-rules-runner',
    '1.0.0',
    'Generic rules runner',
    'Executes any rules package against a structured input with Claude + declared tools.',
    '@broomva/life-modules-core',
    '{"type":"object"}'::jsonb,
    '{"type":"object"}'::jsonb,
    '[]'::jsonb,
    '{"avg":20,"p95":80}'::jsonb
  )
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Platform-owned Sentinel + Materiales projects
-- ---------------------------------------------------------------------------
INSERT INTO "LifeProject"
  ("slug", "displayName", "description", "ownerKind", "ownerId",
   "moduleTypeId", "visibility", "status", "stats")
VALUES
  (
    'sentinel',
    'Sentinel — property-ops WO audit',
    'AI-native work-order audit for property managers. Flags duplicates, weak closures, follow-up risk, and missing evidence on closed WOs. Free during launch.',
    'platform',
    'platform',
    'sentinel-property-ops',
    'public',
    'active',
    '{"totalRuns":0}'::jsonb
  ),
  (
    'materiales',
    'Materiales Intel — precio unitario en vivo',
    'Investigación de precios unitarios de materiales de construcción, en vivo, sobre el panel de proveedores colombianos. Gratuito durante el lanzamiento.',
    'platform',
    'platform',
    'materiales-intel',
    'public',
    'active',
    '{"totalRuns":0}'::jsonb
  )
ON CONFLICT ("slug") DO NOTHING;
