# Better Auth OAuth-state advisories — upgrade and assessment

BRO-3538. On 2026-10-27 the exact dependency gate failed on two advisories published that day:

- [GHSA-965c-763c-88jm](https://github.com/advisories/GHSA-965c-763c-88jm) (critical): an OAuth state value is accepted as a Magic Link token. Affects `better-auth >=1.4.0-beta.18 <1.7.7`. Exploitation needs a server that runs `magicLink()` alongside social or Generic OAuth sign-in with database-stored state.
- [GHSA-r4xp-prcw-77qf](https://github.com/advisories/GHSA-r4xp-prcw-77qf) (high): OAuth Proxy profile forgery. Affects `better-auth >=1.5.0-beta.12 <1.7.7`. Exploitation needs a server that runs `oauthProxy()` with a shared secret, cookie state and implicit linking.

## Dependency chain

| Copy | Pulled in by | Runs server handlers in-process? |
|---|---|---|
| `better-auth` + `@better-auth/core` 1.6.26 → **1.7.12** | `@broomva/web` direct dependency; peer of `@better-auth/agent-auth` 0.6.2 (root override) | **Yes.** `lib/agent-auth.ts` is the only `betterAuth()` construction, mounted at `/api/auth/agent-protocol/[...path]` via `better-auth/next-js` |
| `better-auth` 1.4.18 (unchanged) | exact pin in `@neondatabase/auth` 0.4.2-beta; also `@neondatabase/auth-ui`, `@better-auth/passkey` 1.4.18, `@daveyplate/better-auth-ui` and `-tanstack` peers | **No.** The app imports only `@neondatabase/auth/next` and `/next/server`. Their runtime graph loads `better-auth/client`, `/client/plugins`, `/react`, `/cookies` and `/types`. Server plugin paths such as `plugins/magic-link` appear only in `.d.ts`. `/api/auth/[...path]` calls `auth.handler()`, which forwards to the hosted `NEON_AUTH_BASE_URL` |

## Decisions

- **Upgrade the local server to 1.7.12, not 1.7.14.** This host enforces npm `min-release-age=7`. 1.7.14 was published 2026-10-26 and 1.7.13 on 2026-10-25. 1.7.12 (2026-10-20) is the newest fixed release outside that window. No published advisory covers 1.7.12. `better-auth` is pinned exactly so a re-resolve cannot pull in a release still inside the cooldown. For the same reason, the one transitive release still inside the window, `set-cookie-parser` 3.2.1 (2026-10-21, pulled in by better-call 1.4.4), is pinned to 3.1.4 through the version-qualified `set-cookie-parser@>=3 <4` override.
- **Agent-auth compatibility.** The plugin imports `createAuthEndpoint`, `createAuthMiddleware` (`@better-auth/core/api`), `APIError` (`@better-auth/core/error`), `getSessionFromCtx`, `sessionMiddleware` (`better-auth/api`) and `mergeSchema` (`better-auth/db`). All of them resolve from the plugin's own location to the 1.7.12 copies. The 1.7 breaking changes cover joins config, account issuer scoping, captcha paths, MCP/OIDC/SCIM/Generic OAuth/device grant moves, the Electron flow and Entra/Google One Tap. None of them touch this server: it configures no social or Generic OAuth providers, no captcha, no OIDC/MCP/SCIM plugin and no Electron client, and it does not create OAuth accounts.
- **Keep Neon Auth 0.4.2-beta.** BRO-2627 cannot retire the 1.4.18 keys today, because every published Neon Auth release pins a vulnerable Better Auth: 0.5.0-beta pins 1.6.23, and 0.6.0-beta and 0.7.0-beta pin 1.7.6, below the 1.7.7 fix. 0.7.0-beta (2026-10-21) is also inside the cooldown. Clearing the keys would mean overriding a vendor's exact pin across three minor lines of the client, UI and passkey packages, for code that runs no server handler here. That is an auth-path migration, not an advisory fix.

## Baseline result

- GHSA-r4xp-prcw-77qf no longer matches the tree, so it is not excepted.
- GHSA-965c-763c-88jm matches only the Neon 1.4.18 copy. It is added to the existing Better Auth record as conditional **in-process** non-applicability.
- The other Better Auth keys are unchanged and still belong to the 1.4.18 copy.
- Topology hashes are re-recorded with the gate's own `dependencyTopologyHash`. Better Auth changes genuinely. The esbuild and undici trees changed only in the Drizzle/Vitest optional-peer lines that print the Better Auth version; the before/after `bun why` diff shows no other line moved.
- `scripts/auth-oauth-state-advisory.test.ts` checks four things:
  - every in-process server copy is `>=1.7.7`, and the agent-auth peer resolves to the app's copy;
  - the evaluated local configuration registers only `agent-auth`, with no `socialProviders` or `genericOAuth`, and the installed plugin contains no `magicLink`, `oauthProxy`, `genericOAuth` or `socialProviders`;
  - only `lib/agent-auth.ts` and the agent-protocol route import Better Auth in the app;
  - Neon's runtime import graph loads only client-side Better Auth modules and no UI packages.

  Mutations tested: adding `socialProviders` to the local server fails the configuration test, and adding a `better-auth/plugins` import elsewhere in the app fails the import-site test.

**This is not a claim about the hosted Neon Auth server.** Neon's client adapter ships `magicLinkClient`, and the hosted service runs social OAuth. Whether the hosted server is patched against GHSA-965c is outside this repository and is tracked separately.

## Review deadline

`reviewBy` moves from 2026-10-27 to **2026-11-10**. Real exceptions still need it: the Neon 1.4.18 copy (waiting on a Neon release that pins `>=1.7.7`), undici 5.x on ConnectRPC v1, and the development-only and build-only tooling records reassessed earlier today. Two weeks bounds the wait for a fixed Neon release and gives time to fold in the hosted-side probe. No gate code or threshold changes.

Receipts: before/after `bun why` trees and CI logs from the implementation host are summarized in the PR.
