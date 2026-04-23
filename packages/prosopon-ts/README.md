# @broomva/prosopon

TypeScript bindings for [Prosopon](../../../core/prosopon) — the Life Agent OS display server. Wire-compatible with `prosopon-protocol` v1.

## What this package provides

| Module | Purpose |
|---|---|
| `.` (default) | Re-exports of IR types + runtime helpers |
| `./codec` | JSON/JSONL envelope encode/decode |
| `./apply-event` | Pure reducer: `applyEvent(scene, event) → scene` |
| `./client` | Browser client — WS primary, SSE fallback |
| `./session` | Server-side session emitter |
| `./ids` | ID factories (NodeId, SceneId, StreamId, Topic) |

## Type layering

```
src/
├── generated/
│   ├── scene.json         ← snapshot of prosopon-core's JSON schema (Scene)
│   ├── event.json         ← snapshot (ProsoponEvent)
│   └── types.ts           ← json-schema-to-typescript output (generated)
├── types.ts               ← re-exports + curated facade over generated types
├── codec.ts               ← Envelope + Codec (JSON, JSONL) matching prosopon-protocol
├── apply-event.ts         ← Pure reducer for all 8 ProsoponEvent variants
├── client.ts              ← WS primary, SSE fallback, reconnect policy
├── session.ts             ← Server emitter (used by broomva.tech API routes)
├── ids.ts                 ← ID factory helpers
└── index.ts
```

## Regenerating types from the Rust source of truth

```bash
cd ../../../core/prosopon
cargo run -p prosopon-cli -- schema scene > /tmp/scene.json
cargo run -p prosopon-cli -- schema event > /tmp/event.json
cd -
cp /tmp/scene.json src/generated/scene.json
cp /tmp/event.json src/generated/event.json
bun run generate
```

## Minimal example

### Server (Node / Bun / edge)

```ts
import { ProsoponSession, makeEnvelope } from "@broomva/prosopon";

const session = new ProsoponSession("session-123");
yield session.sceneReset({ id: "scene-1", root: { ... } });
yield session.nodeAdded("chat", { intent: { type: "stream", id: "m1", kind: "text" } });
yield session.streamChunk("m1", { encoding: "text", text: "Hello" }, 1);
```

### Browser

```ts
import { ProsoponClient, applyEvent, type Scene } from "@broomva/prosopon";

const client = new ProsoponClient("/api/life/run/sentinel/prosopon");
let scene: Scene = { id: "init", root: { id: "root", intent: { type: "empty" }, children: [], bindings: [], actions: [], attrs: {}, lifecycle: { created_at: new Date().toISOString() } } };

client.onEnvelope((envelope) => {
  scene = applyEvent(scene, envelope.event);
  render(scene);
});

client.connect();
```

## Forward-compat

When Mission Control / Prompter / third parties adopt Prosopon, this package migrates into `core/prosopon/bindings/typescript/` and publishes to npm. Imports don't change.
