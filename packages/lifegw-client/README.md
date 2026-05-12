# @broomva/lifegw-client

Typed TypeScript client for `life.v1.*` services exposed by `lifegw` — the
TLS edge gateway of the Life Runtime.

This package is a thin wrapper around proto-generated bindings (Connect-Web
for browser, gRPC-native for Node) plus a small set of helpers for auth and
token caching.

## Generated bindings

```sh
bun run gen
```

Regenerates from `../../../core/life/proto/life/v1/*.proto` into `src/gen/`.
The generated directory is gitignored; CI regenerates on each build.

## Browser usage

```ts
import { createBrowserClient, staticTokenProvider } from "@broomva/lifegw-client";

const client = createBrowserClient({
  proxyBaseUrl: "/api/life-proxy",
  wsBaseUrl: "wss://life.broomva.tech",
  getToken: async () => fetch("/api/life-auth/token").then((r) => r.text()),
});

const session = await client.agent.createSession({
  /* ... */
});
for await (const event of client.agent.streamSession({
  sid: session.sid,
  fromSequence: 0n,
})) {
  // render event
}
```

## Server usage

```ts
import {
  createServerClient,
  staticTokenProvider,
} from "@broomva/lifegw-client";

const client = createServerClient({
  baseUrl: process.env.LIFEGW_URL!,
  getToken: staticTokenProvider(process.env.LIFEGW_SERVICE_JWT!),
});
```

See `docs/superpowers/specs/2026-05-11-broomva-ai-os-first-slice-design.md` §5.
