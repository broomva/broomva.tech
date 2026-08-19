# Vendored: `ppr-rdc-inspect.mjs`

Upstream: <https://github.com/vercel-labs/ppr-rdc-inspector> (MIT, © 2026 Vercel, Inc. — see `LICENSE`).

Vendored rather than fetched at run time so the gate in
`../audit-prerender-cache.mjs` is reproducible and does not execute code
downloaded from the network during CI.

It decodes Next.js PPR postponed state and Render Resume Data Cache values out
of `.next/server/**/*.meta`. It is read-only: its only imports are
`node:fs/promises` (`readdir`/`readFile`/`stat`), `node:path`, and
`node:zlib` (`inflateSync`). No network, no child processes, no writes.

Refresh by re-copying `bin/ppr-rdc-inspect.mjs` from upstream. If upstream
changes its output markers, `audit-prerender-cache.mjs` fails closed rather
than silently scanning nothing — see its `assertDecoderContract()`.

Context: Vercel security notice (BRO-2189) — the Vercel CDN briefly returned
internal prerender data to clients for projects using Cache Components.
