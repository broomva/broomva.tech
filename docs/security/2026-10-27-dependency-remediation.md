# BRO-3533 / BRO-3534 dependency remediation

Scope: website PR #294, based on `9237f15`. Implementation checkout only;
no source-repository edits, source-pin changes, database migrations, push,
merge or deployment. Parent owns independent review and delivery.

## Plan and decisions

1. Update bounded direct dependencies and same-major transitives.
2. Prove the three cross-major compatibility boundaries before retaining them.
3. Prune resolved advisory allowances; reassess retained topology without changing
   the existing 2026-10-27 deadline or accepting new advisory keys.
4. Run audit, tests, types, lint, direct Next builds and publication checks;
   return the committed implementation for fresh independent review.

Upstream: root/workspace manifests, `bun.lock`, registry tarballs, official
advisories and `scripts/audit-dependencies.ts`. Downstream: both Next apps,
Sentry instrumentation, MCP, Base Account/CDP, Firecrawl, Sandbox, Life RPC,
CI/security workflows and `scripts/dependency-audit-baseline.json`.

- Bun 1.4.4 is pinned in packageManager and both workflows. A scratch install
  proved Bun 1.3.14 ignores nested overrides, while 1.4.4 applies them.
  Version-qualified same-major rules preserve fast-uri 3/4, selector-parser
  6/7 and Undici 6/7. There is no global cross-major override.
- Undici 5.29.0 alone receives Busboy 3.2.2. Keep ConnectRPC/Protobuf v1 APIs
  and generated classes. Tests resolve ConnectRPC's actual Undici copy under
  Node and exercise fragmented HTTP multipart, duplicate fields, base64 files,
  inherited header names, truncated data, HTTP/2 gRPC unary/server streaming
  and per-call bearer renewal. CI now runs this transport suite.
- Zod 4.6.6 uses the actual v4 entry point. No use of bundled `zod/v3` as a
  mitigation. Override only the pinned Coinbase, abitype, Firecrawl and
  converter parents that previously required v3. Coinbase's one-argument
  record gets an explicit string key in ESM/CJS. Firecrawl's ESM/CJS conversion
  uses native toJSONSchema with Draft 7 and input semantics, preserving the
  former payload dialect and required fields. Sandbox 2.2.0 declares Zod 4.
- Tests exercise Coinbase ESM/CJS records, address/ABI rejection and public
  imports, Firecrawl HTTP search/scrape/asynchronous extraction, supported
  Sandbox create/command stream/stop, and MCP HTTP initialization/tool calls,
  authorization and invalid arguments. These use local fixtures, not remote
  provider credentials; remote provider integration is not certified.
- The v4 regression test checks early rejection of oversized **constrained**
  arrays, sets and maps. The upstream fix does not bound arbitrary unbounded
  schemas or all hostile JSON.
- A direct production build exposed agent-auth 0.6.2 resolving core 1.4.18,
  which lacks APIError. Its peers are scoped to the existing server's Better
  Auth/core 1.6.26. Neon Auth's pinned client adapters remain separate.
- All lint errors were in the immutable imported deck. Website Biome excludes
  that versioned upstream bundle, as it excludes other vendored/generated
  code. No lint rule, test, advisory threshold or gate implementation changed.
  `check:agent-workspaces` still validates every pinned release checksum.
  Page components and generated release bytes remain unchanged.

## Fresh security assessment — 2026-10-27

The live audit has zero newly accepted keys. Removed 16 stale allowances for
fast-uri, Hono, ip-address, Next and fixed Undici ranges. Existing baseline
expiry remains `2026-10-27T23:59:59Z`; this work grants no extension.

All retained `bun why` trees were inspected and saved in the implementation
receipts; changed hashes reflect the reviewed parent versions and Bun's changed
tree rendering, not a claim that these remaining findings were patched:

- @fastify/static, Fastify and file-type: unchanged Evalite development CLI
  branches, absent from the deployed Next server's imports.
- esbuild: remaining affected 0.18.20 comes from Drizzle development tooling;
  the newer Sentry/tooling parents do not expose an esbuild server.
- brace-expansion: still minimatch/glob via Sentry build tooling, Ultracite and
  Evalite static tooling. Repository-controlled build inputs only.
- image-size: unchanged Fumadocs build-time asset parsing.
- Axios 1.19.0: same CDP, Firecrawl and Tavily parents; their provider base URLs
  are internal constants/configuration. Firecrawl's requested scrape URL is
  sent in JSON to Firecrawl, not used as the Axios destination.
- Better Auth: hosted Neon proxy plus pinned client/cookie/UI adapters still
  use 1.4.18; the application agent-auth server uses 1.6.26/core 1.6.26.
  The existing critical/high residual allowances remain visible and expire
  today. This patch does not complete BRO-2627's Neon migration.
- Undici: all 6/7 branches patched; ten pre-existing advisory keys still apply
  to ConnectRPC's 5.29.0 branch. Busboy mitigation does not resolve Undici's
  other HTTP parsing/DoS risks. Gateway destinations are operator-configured.

## Primary sources

- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd
- https://github.com/advisories/GHSA-x8mw-p69m-v3mx
- https://github.com/advisories/GHSA-gxm5-99cw-xjw9
- https://bun.sh/docs/pm/overrides
- https://docs.firecrawl.dev/api-reference/v1-endpoint/extract
- https://docs.firecrawl.dev/api-reference/v1-endpoint/search
- https://docs.firecrawl.dev/api-reference/v1-endpoint/scrape

Registry/advisory evidence and command logs: `/tmp/aw-deps-diagnosis`,
`/tmp/aw-zod-proof`, `/tmp/aw-site-remediation` on the implementation host.

## Validation receipts

Passed on macOS with Bun 1.4.4 / Node 26:

- Frozen install; policy tests: 7 passed; exact advisory gate: 1 critical,
  26 high, 20 moderate, all pre-existing keys (no new allowances).
- Website Vitest: 97 files, 772 passed, 1 existing skipped; real Redis on an
  isolated port/db15. SDK/MCP compatibility: 5 tests within that suite.
- Life client: 3 files, 8 passed, including 3 transport integration tests;
  client types pass. Root types pass; direct web build also checks all types.
- Lint passes with 101 existing warnings / 9 infos; links pass; content passes
  with 249 existing external/Lago asset warnings; release verifier: 3 tests,
  13 pinned files verified without changing release bytes.
- Direct `next build` for both apps passes; no migration wrappers invoked.
- Production server on local port 3028: browser title, h1, canonical URL,
  absolute OG image and loaded preview inspected. Page, deck, actual static OG
  asset and Next image optimization each return 200. No UI files changed.

Limitations: Turbo 2.10.9 warns while reading nested Bun override maps, then
runs its tasks successfully; remote cache/dependency graph features may be
limited. Sentry reports existing configuration deprecations. This target has
no `make control-audit` target (command fails with "No rule to make target").
CI/Linux, remote SDK services, deployment and the new independent review are
not certified here. Bridge stamp was fresh on intake; this host's automatic
session capture was not verified. No CI polling or watching was used.

The checkout's seven tracked absolute platform symlinks were temporarily moved
aside for install/checks, matching CI where their external targets are absent,
and restored unchanged before commit. No private platform target was modified.

Fresh-install proof: a separate manifests/lock/patch snapshot installed into an
empty node_modules tree. The first reduced fixture lacked Fumadocs' source
configuration and its postinstall failed; adding the real source.config,
tsconfig and docs content fixed that fixture. Frozen install and the actual
Fumadocs postinstall then passed. Installed ESM patch contents were asserted,
and the frozen lock bytes match the implementation checkout exactly.
