# Spec — Canonical Life Runtime on broomva.tech

**Date**: 2026-05-03
**Status**: ACTIVE — implementation in PR (TBD)
**Owners**: chat app `/life/*` surface + `lib/life-runtime/*`
**Scope**: TS-side substrate of the Life Agent OS as it lives in this repo.

## Why this exists

`/life/[project]/*` is the user-facing surface of the Life Agent OS on
broomva.tech. Today's plumbing has three problems that block scaling
beyond the three demo projects (sentinel / materiales / sentinel-paid):

1. **Two sources of truth for projects.** The `LifeProject` DB rows
   carry the production identity (slug, ownerKind, moduleTypeId,
   pricingConfig), while `app/(site)/life/_lib/project-map.ts` carries
   UI display metadata (suggestions, chip color, system prompt prefix).
   Adding a new `/life/<new-slug>` requires touching both. Drift is
   inevitable.

2. **Tool dispatch and the agent loop are conflated.** `RealAgentRunner`
   in `lib/life-runtime/real-runner.ts` runs the agent loop inline in
   Next.js AND dispatches tools through `KernelClient`. The
   `KernelClient` half is correctly half-built (interface + InProcess
   impl + factory throwing on `LIFED_GATEWAY_URL`); the agent-loop half
   has no abstraction boundary at all. There is no path to move the
   loop into `arcand` without a rewrite.

3. **Canonical wire transport is unused.** Spec C₂ §6 + Spec C₃ §6
   define `life.v1.Agent.StreamSession` (bidi WebSocket via lifegw,
   bridging to bidi gRPC stream into lifed). The TS SDK at
   `core/life/sdks/life-sdk-ts/src/ws.ts` ships full reconnect, bearer
   subprotocol, and `from_sequence` resume. None of it is wired in.

## Architecture

The Life Agent OS is a layered system with two distinct, complementary
transports:

```
                            ┌────────────────────────────────┐
                            │  Browser (chatOS / broomva.tech)│
                            └──────────────┬─────────────────┘
                                           │
            ┌──────────────────────────────┼─────────────────────────────┐
            │  Streaming highway (this PR) │  Control-plane (existing)    │
            │                              │                              │
            │  WebSocket — Agent.Stream─   │  HTTPS + Connect-RPC         │
            │  Session (one bidi stream    │  KernelService.Dispatch      │
            │  per agent turn)             │  + Wallet/Identity/Events    │
            └──────────────┬───────────────┼──────────────┬───────────────┘
                           │                              │
                  ┌────────▼─────────┐          ┌────────▼─────────┐
                  │ AgentSession     │          │ KernelClient      │
                  │ Client (TS)      │          │ (TS) — already    │
                  │  ─────────────   │          │ in lib/.../kernel │
                  │  InProcess │ Lifed│         │ ─────────────────│
                  │  WS ─default│ ────│         │  InProcess │ Lifed │
                  └──────────────────┘          │  default   │ HTTP  │
                                                └───────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│ Canonical project registry (single source of truth)                    │
│  apps/chat/lib/life-runtime/projects.ts                                │
│  - slug → { displayName, description, moduleTypeId, model, tools,      │
│            systemPrompt, billing, suggestions, chip, ... }             │
│  - Used by: /api/life/run/[project]/route, /life/[project]/page,       │
│             DB seed script, health endpoint, type-checked exhaustive   │
└───────────────────────────────────────────────────────────────────────┘
```

The center of gravity for an agent **turn** is the streaming highway
(`AgentSessionClient`). Tool dispatch is a SUBSIDIARY concern — when
`Lifed` is the agent host, tool dispatches don't traverse the
browser↔lifegw boundary as separate calls during a run. They happen
server-side in arcand and are reported back via the same WebSocket
stream as `tool_call` / `tool_result` events.

The unary `KernelClient` stays for **out-of-loop** uses (admin
tooling, snapshot/fork/hibernate orchestration, dev console, tests).

## Two layers of "wired"

### Layer A — TS substrate canonical (this PR)

Acceptance:

- [x] `Agent.StreamSession` is the canonical transport for an agent turn.
- [x] Two implementations of `AgentSessionClient`:
  - `InProcessAgentSessionClient` — wraps `RealAgentRunner` (today's
    behavior, conformed to the new event shape).
  - `LifedWsAgentSessionClient` — opens a WebSocket against
    `${LIFED_GATEWAY_URL}/v1/agent/stream`, sends a `start` frame,
    pumps `agent_event` frames out as `AgentEvent`s.
- [x] Single typed project registry (`projects.ts`) drives the route,
  the UI page, the DB seed, and the health snapshot.
- [x] Route handler shrinks to ≤200 LOC of validation + delegation; all
  orchestration moves into `LifeRuntime`.
- [x] Health endpoint reports the current backend (`agent-session`,
  `kernel`) so the Dock SIM/LIVE/COMING badges become data-driven.
- [x] Conformance tests — both client implementations satisfy the same
  event-shape and ordering battery.

This ships **without** a real lifed deployment. The factory defaults
to `InProcess`; setting `LIFED_GATEWAY_URL` flips to `LifedWs`.

### Layer B — full agent-host migration (separate operational milestone)

Out of scope for this PR. Tracks:

- Deploy `lifegw` + `lifed` + `arcand` to a host that supports
  long-lived processes (Fly.io / Railway / Hetzner — not Vercel
  Edge).
- Provision DNS + TLS for `gw.broomva.life` (or equivalent).
- Set `LIFED_GATEWAY_URL` and Tier-2 KMS bypass token in Vercel env.
- Operator runbook for cert/JWKS rotation.

Once Layer B lands, the SIM badges in `/life/*` flip to LIVE without
any code change in this repo. That's the whole point of the layered
shape.

## Canonical contracts

### `AgentEvent` (TS mirror of `aios.v1.AgentEvent` from
`core/life/proto/life/v1/agent.proto`)

Hand-mirrored, not codegenned. The canonical wire shape is the proto;
the TS shape mirrors it 1:1 with idiomatic types. Drift is policed by
a single review pass when the proto bumps.

```ts
type AgentEvent =
  | { kind: "session_opened"; sessionId: string; vmHandle: VmHandle; seq: bigint }
  | { kind: "text_delta"; text: string; seq: bigint }
  | { kind: "thinking_start"; seq: bigint }
  | { kind: "thinking_end"; ms: number; seq: bigint }
  | { kind: "tool_call"; call: ToolCall; seq: bigint }
  | { kind: "tool_result"; result: ToolResult; seq: bigint }
  | { kind: "fs_op"; path: string; op: "read" | "write"; bytes?: number; seq: bigint }
  | { kind: "nous_score"; dim: string; score: number; seq: bigint }
  | { kind: "autonomic_event"; event: AutonomicEventPayload; seq: bigint }
  | { kind: "haima_billed"; amountMicrocredits: bigint; settle: "credits" | "x402"; seq: bigint }
  | { kind: "vigil_span"; span: VigilSpanSummary; seq: bigint }
  | { kind: "error"; code: string; message: string; seq: bigint }
  | { kind: "done"; finishReason: string; lastSeq: bigint };
```

`seq` is the lifed-assigned monotonic sequence (per the proto). For
`InProcess`, the runtime assigns sequential sequence numbers
synthetically. For `LifedWs`, sequences come from the wire and drive
the resume cursor.

### `AgentSessionClient` (interface)

```ts
interface AgentSessionClient {
  readonly backendId: "in-process" | "lifed-ws";
  stream(input: AgentStreamInput, signal?: AbortSignal): AsyncIterable<AgentEvent>;
  health(): Promise<AgentSessionHealth>;
}

interface AgentStreamInput {
  sessionId: string;            // LifeSession.id
  agentId: string;              // ConsumerIdentity-derived
  projectSlug: ProjectSlug;
  userMessage: string;
  fromSequence?: bigint;        // resume cursor (lifed-ws only)
  capability?: TierUserCap;     // Spec D Tier-User cap (when present)
  vm?: VmHandle;                // existing VM handle (resume)
  history: LifeConversationMessage[];
}

interface AgentSessionHealth {
  backendId: string;
  reachable: boolean;
  detail?: string;
}
```

### Project registry (canonical)

```ts
const PROJECT_CONFIG_SCHEMA = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  displayName: z.string().min(1),
  description: z.string().optional(),
  moduleTypeId: z.string(),                 // matches LifeModuleType.id
  systemPrompt: z.string(),                 // baseline; runtime composes header
  defaultModel: z.string(),                 // AppModelId
  toolAllowlist: z.array(z.string()),       // tool names
  billing: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("free") }),
    z.object({ mode: z.literal("credits"), pricePerRunCents: z.number().int().nonnegative() }),
    z.object({ mode: z.literal("x402"),    pricePerRunCents: z.number().int().nonnegative(), railChainId: z.string() }),
  ]),
  ui: z.object({
    chipColor: z.enum(["emerald", "amber", "violet", "blue", "rose"]),
    eyebrow: z.string(),
    emptyTitle: z.string().optional(),
    emptyHint: z.string().optional(),
    suggestions: z.array(z.object({ label: z.string(), prompt: z.string() })).max(8).optional(),
  }),
});

export const PROJECTS: Record<ProjectSlug, ProjectConfig> = defineProjects({ ... });
```

## Health-endpoint contract changes

`/api/life/health` already returns `LifeHealth` with a structured
`services[]` array. The contract gains two ids:

- `id: "agent-session"` — `live` when an `AgentSessionClient` is
  successfully constructed and its `health()` returns `reachable: true`.
- `id: "lifed"` — `live` when `LIFED_GATEWAY_URL` is set AND a probe
  hits `/healthz` on lifegw. `not-deployed` otherwise.

The Dock continues to render from this snapshot — no change needed
in `Dock.tsx` beyond the static-snapshot's defaults.

## Ordering & deployment plan

This PR ships strictly Layer A. The change order on disk is:

1. Spec doc (this file) + canonical event types (`agent-session/types.ts`).
2. Project registry (`lib/life-runtime/projects.ts`) + DB-seed bridge.
3. `AgentSessionClient` interface + `InProcessAgentSessionClient` (wraps `RealAgentRunner`).
4. `LifedWsAgentSessionClient` (vendored minimal WS state machine + bearer subprotocol).
5. Factory + canonical `LifeRuntime` (`lib/life-runtime/canonical.ts`).
6. Route refactor (`app/api/life/run/[project]/prosopon/route.ts` shrinks).
7. Health endpoint extension + Dock data-driven defaults.
8. Tests (conformance, registry, runtime, route, e2e).
9. Architecture doc cross-references; CHANGELOG; PR open.

CI surface: `bun run typecheck`, biome lint, `bun run test`,
Vercel preview deploy, agent-browser smoke against the preview.

## Out of scope (filed for follow-up)

- Browser-direct WS mode (browser opens `/v1/agent/stream` itself,
  Next.js exits the agent path). Requires Tier-User cap minted
  client-side via passkey custody — needs Layer B + chatOS-style
  passkey enrollment UI that broomva.tech doesn't yet have.
- Multi-tenant project ownership with creator splits (the registry is
  platform-owned in this PR; user-created projects are a separate
  pricing/auth track).
- Generic EIP-712 encoder, FIDO2 attestation chain verification — same
  follow-ups as the Spec D D-Sub-C Stream R-2 docs.

## Acceptance summary

The PR is done when:

- [ ] All listed contracts ship and are tested.
- [ ] The 3 existing demo projects continue to work end-to-end via the
  agent-browser test on the Vercel preview.
- [ ] Adding a new project requires a single edit to `projects.ts` + a
  one-line DB seed entry — no route changes, no UI changes.
- [ ] `/api/life/health` returns the new `agent-session` and `lifed`
  service rows; the Dock renders them.
- [ ] `bun run typecheck` clean, biome lint zero new errors,
  `bun run test` passes (existing 24 + new conformance/registry/runtime
  tests), Vercel preview deploys, agent-browser smoke green.
- [ ] PR is squash-merged after CI green.
