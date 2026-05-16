/**
 * Contract tests for `InProcessAgentSessionClient`.
 *
 * Wires the contract harness (`./contract.ts`) to a deterministic
 * `RealAgentRunner` stub. The stub reads a script from a globalThis
 * registry keyed by `lifeSessionId`. Each call to `runner.run()`
 * consumes the next scripted turn.
 *
 * Plan E-2 Task 4.
 *
 * The `vi.mock` factory hoists above imports — to share state between
 * the mock and the test, we route through `globalThis.__inproc_contract`,
 * a `WeakMap`-style record initialised lazily by the mock factory and
 * read by both sides.
 *
 * @see ./contract.ts
 * @see ../in-process-client.ts
 */

// @vitest-environment node
import { afterEach, beforeEach, vi } from "vitest";

// Shared registry — must live in a stable globalThis slot so the
// hoisted `vi.mock` factory can find it at module-evaluation time.
interface ContractGlobal {
  scripts: Map<string, { turns: Array<{ tokens: string[] }> }>;
  turnIndexes: Map<string, number>;
  observations: Map<
    string,
    {
      observedTurns: Array<{
        userMessage: string;
        history: Array<{ role: "user" | "assistant"; content: string }>;
      }>;
    }
  >;
}

const __global = globalThis as unknown as {
  __inproc_contract?: ContractGlobal;
};
if (!__global.__inproc_contract) {
  __global.__inproc_contract = {
    scripts: new Map(),
    turnIndexes: new Map(),
    observations: new Map(),
  };
}
const G: ContractGlobal = __global.__inproc_contract;

// `in-process-client.ts` begins with `import "server-only"`. Stub it
// out so it loads under raw Node.
vi.mock("server-only", () => ({}));

// Mock `real-runner` BEFORE its consumer imports it. The fake runner
// reads `globalThis.__inproc_contract` lazily — at `run()` call time
// rather than at factory-evaluation time — so the registry exists
// even though vi.mock hoists ABOVE the module body that sets it up.
vi.mock("../../real-runner", () => {
  const getG = (): ContractGlobal => {
    const g = (globalThis as unknown as { __inproc_contract?: ContractGlobal })
      .__inproc_contract;
    if (!g) {
      throw new Error(
        "in-process-contract.test: __inproc_contract registry missing; test setup is broken",
      );
    }
    return g;
  };
  return {
    makeLifeToolHandlers: () => ({}),
    RealAgentRunner: class FakeRunner {
      private readonly sid: string;
      private readonly userMessage: string;
      private readonly history: Array<{
        role: "user" | "assistant";
        content: string;
      }>;
      constructor(opts: {
        lifeSessionId?: string;
        userMessage: string;
        history: Array<{ role: "user" | "assistant"; content: string }>;
      }) {
        this.sid = opts.lifeSessionId ?? "";
        this.userMessage = opts.userMessage;
        this.history = opts.history.map((h) => ({ ...h }));
      }
      async *run() {
        const G2 = getG();
        const turns = G2.scripts.get(this.sid);
        const turnIndex = G2.turnIndexes.get(this.sid) ?? 0;
        const turn = turns?.turns[turnIndex];

        // Observe BEFORE yielding so the test can assert mid-stream.
        const obs = G2.observations.get(this.sid);
        if (obs) {
          obs.observedTurns.push({
            userMessage: this.userMessage,
            history: this.history.map((h) => ({ ...h })),
          });
        }
        G2.turnIndexes.set(this.sid, turnIndex + 1);

        if (!turn) {
          // Out-of-script — yield a finish so the iterator unblocks.
          yield {
            kind: "domain",
            event: {
              type: "done",
              payload: { finishReason: "stop" },
              at: new Date().toISOString(),
            },
          };
          return;
        }

        // text-start / token deltas / text-end as LLM stream parts.
        const msgId = `msg-${Date.now()}-${turnIndex}`;
        yield {
          kind: "llm",
          part: { type: "text-start", id: msgId },
          at: new Date().toISOString(),
        };
        for (const delta of turn.tokens) {
          yield {
            kind: "llm",
            part: { type: "text-delta", id: msgId, delta, text: delta },
            at: new Date().toISOString(),
          };
        }
        yield {
          kind: "llm",
          part: { type: "text-end", id: msgId },
          at: new Date().toISOString(),
        };
        // Per-turn done — in-process client swallows in multi-turn,
        // forwards in per-turn mode.
        yield {
          kind: "domain",
          event: {
            type: "done",
            payload: { finishReason: "stop" },
            at: new Date().toISOString(),
          },
        };
      }
    },
  };
});

// Kernel factory — returns a fake KernelClient with no-op VM.
vi.mock("../../kernel/factory", () => ({
  createKernelClient: () => ({
    backendId: "in-process",
    createVm: async () => ({
      handleId: "vm-fake",
      backendId: "in-process",
    }),
    destroy: async () => undefined,
  }),
}));

// `kernel/in-process-client` re-exports the ToolHandler type — the
// import is type-only on the real path, but the cjs interop wants
// SOMETHING at runtime. Empty module is fine.
vi.mock("../../kernel/in-process-client", () => ({}));

// Projects — minimal fake.
vi.mock("../../projects", () => {
  const slug = "sentinel-property-ops";
  const cfg = {
    slug,
    moduleTypeId: "sentinel-property-ops",
    toolAllowlist: ["note"],
    billing: { mode: "free" as const, pricePerRunCents: 0 },
  };
  return {
    isProjectSlug: (s: string) => s === slug,
    getProjectConfig: () => cfg,
  };
});

// Imports happen AFTER vi.mock so the module graph builds with mocks.
import { InProcessAgentSessionClient } from "../in-process-client";
import {
  type AgentSessionScript,
  type MakeClient,
  runAgentSessionClientContract,
  type SubstrateObservations,
} from "./contract";

beforeEach(() => {
  G.scripts.clear();
  G.turnIndexes.clear();
  G.observations.clear();
});

afterEach(() => {
  G.scripts.clear();
  G.turnIndexes.clear();
  G.observations.clear();
});

const makeInProcessClient: MakeClient = (script: AgentSessionScript) => {
  const observations: SubstrateObservations = { observedTurns: [] };
  const client = new InProcessAgentSessionClient({
    resolveProject: async () =>
      ({
        id: "fake-project-id",
        slug: "sentinel-property-ops",
        moduleTypeId: "sentinel-property-ops",
        displayName: "Sentinel",
      }) as never,
  });

  // Wrap stream() so the first call seeds the script/observations
  // registry with the sid the client uses. Subsequent calls reuse.
  const originalStream = client.stream.bind(client);
  // biome-ignore lint/suspicious/noExplicitAny: test-only patch
  (client as any).stream = async function* (input: {
    sessionId: string;
  }): AsyncIterable<unknown> {
    if (!G.scripts.has(input.sessionId)) {
      G.scripts.set(input.sessionId, script);
      G.turnIndexes.set(input.sessionId, 0);
      G.observations.set(input.sessionId, observations);
    }
    // biome-ignore lint/suspicious/noExplicitAny: test-only forward
    yield* originalStream(input as any);
  };

  return { client, observations };
};

runAgentSessionClientContract(
  "InProcessAgentSessionClient",
  makeInProcessClient,
);
