import "server-only";
import type { ProsoponEvent } from "@broomva/prosopon";

// Lazy import — keeps the factory module free of DB / env imports so
// `getUpstream` is cheap and unit-testable without booting Postgres.
// The session-runtime facade transitively imports canonical → db; we
// only pay that cost when the adapter is actually exercised.
type SessionRuntimeModule = typeof import("@/lib/life-runtime/session-runtime");
let _sessionRuntime: SessionRuntimeModule | null = null;
async function sessionRuntime(): Promise<SessionRuntimeModule> {
  if (!_sessionRuntime) {
    _sessionRuntime = await import("@/lib/life-runtime/session-runtime");
  }
  return _sessionRuntime;
}

export interface UpstreamRuntime {
  kind: "in-process" | "lifegw";

  /** Open a stream of Prosopon envelopes for a session, starting at fromSeq. */
  streamSession(opts: {
    sid: string;
    fromSeq: bigint;
    signal: AbortSignal;
  }): AsyncIterable<ProsoponEvent>;

  sendMessage(opts: { sid: string; content: string }): Promise<void>;
  approveDispatch(opts: { sid: string; dispatchId: string }): Promise<void>;
  cancelDispatch(opts: {
    sid: string;
    dispatchId: string;
    reason?: string;
  }): Promise<void>;
}

/**
 * Pick the upstream runtime for the Session lens proxy.
 *
 * Default: the in-process Prosopon emitter living in apps/broomva/lib/life-runtime
 * (same surface the legacy /life/[project] route uses). Switches to a lifegw
 * adapter that wraps @broomva/lifegw-client when LIFEGW_URL is set.
 *
 * The two adapters expose the same UpstreamRuntime interface so the Route
 * Handlers in this directory are runtime-agnostic.
 */
export function getUpstream(): UpstreamRuntime {
  if (process.env.LIFEGW_URL) {
    return createLifegwAdapter();
  }
  return createInProcessAdapter();
}

function createInProcessAdapter(): UpstreamRuntime {
  return {
    kind: "in-process",
    async *streamSession({ sid, fromSeq, signal }) {
      const rt = await sessionRuntime();
      for await (const ev of rt.streamSession({ sid, fromSeq, signal })) {
        if (signal.aborted) break;
        yield ev;
      }
    },
    async sendMessage({ sid, content }) {
      const rt = await sessionRuntime();
      await rt.sendMessage({ sid, content });
    },
    async approveDispatch({ sid, dispatchId }) {
      const rt = await sessionRuntime();
      await rt.approveDispatch({ sid, dispatchId });
    },
    async cancelDispatch({ sid, dispatchId, reason }) {
      const rt = await sessionRuntime();
      await rt.cancelDispatch({ sid, dispatchId, reason });
    },
  };
}

function createLifegwAdapter(): UpstreamRuntime {
  return {
    kind: "lifegw",
    async *streamSession() {
      throw new Error("lifegw streamSession not yet implemented (LIFEGW_URL set but adapter is stub)");
    },
    async sendMessage() {
      throw new Error("lifegw sendMessage not yet implemented");
    },
    async approveDispatch() {
      throw new Error("lifegw approveDispatch not yet implemented");
    },
    async cancelDispatch() {
      throw new Error("lifegw cancelDispatch not yet implemented");
    },
  };
}
