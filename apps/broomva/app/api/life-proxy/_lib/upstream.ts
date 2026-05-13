import "server-only";
import type { ProsoponEvent } from "@broomva/prosopon";

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
    async *streamSession() {
      // Implementation lands in Task 3 once we've inspected the existing
      // canonical runtime API. For now, throw so unwired call sites fail loudly.
      throw new Error("in-process streamSession not yet implemented");
    },
    async sendMessage() {
      throw new Error("in-process sendMessage not yet implemented");
    },
    async approveDispatch() {
      throw new Error("in-process approveDispatch not yet implemented");
    },
    async cancelDispatch() {
      throw new Error("in-process cancelDispatch not yet implemented");
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
