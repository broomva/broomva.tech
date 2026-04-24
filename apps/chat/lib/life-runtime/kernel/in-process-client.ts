/**
 * Life Runtime — In-process KernelClient.
 *
 * Executes tools inline in the Next.js runtime (same process, no network
 * hop). Equivalent to what the runner did before this abstraction existed —
 * but now every dispatch carries `KernelContext` (session/agent attribution)
 * and returns `ResourceUsage` (duration measured, other fields "estimated"
 * pending a real backend).
 *
 * This is the only implementation Phase A ships. When lifed Phase 2 ships
 * plus an HTTPS gateway lands, `LifedHttpKernelClient` slots in behind the
 * factory with identical semantics; only `ResourceUsage.confidence` changes
 * from `"estimated"` to `"measured"`.
 */

import { randomUUID } from "node:crypto";
import {
  type KernelClient,
  KernelNotImplementedError,
} from "./kernel-client";
import type {
  BackendId,
  ForkSpec,
  KernelContext,
  ResourceUsage,
  ToolCall,
  ToolResult,
  VmHandle,
  VmSnapshotHandle,
  VmSpec,
} from "./types";

export type ToolHandler<I = unknown, O = unknown> = (
  input: I,
  ctx: KernelContext,
) => Promise<O>;

export interface InProcessKernelClientOptions {
  /**
   * Tool name → handler map. Unknown tool names fail the dispatch with
   * `isError: true`. Handlers may throw; thrown errors are caught and the
   * message is surfaced via `outputJson`.
   */
  tools: Record<string, ToolHandler>;
}

export class InProcessKernelClient implements KernelClient {
  readonly backendId: BackendId = "in-process";
  private readonly tools: Record<string, ToolHandler>;

  constructor(opts: InProcessKernelClientOptions) {
    this.tools = opts.tools;
  }

  async createVm(spec: VmSpec, ctx: KernelContext): Promise<VmHandle> {
    return {
      vmId: randomUUID(),
      backend: spec.backendHint ?? this.backendId,
      sessionId: ctx.sessionId,
      agentId: ctx.agentId,
      status: { state: "running" },
      createdAt: new Date().toISOString(),
      metadataJson: spec.metadataJson ?? "{}",
    };
  }

  async dispatch(
    _vm: VmHandle,
    call: ToolCall,
    ctx: KernelContext,
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const handler = this.tools[call.toolName];

    if (!handler) {
      return errorResult(
        call,
        `Unknown tool "${call.toolName}"`,
        Date.now() - startedAt,
      );
    }

    let parsedInput: unknown;
    try {
      parsedInput = call.inputJson ? JSON.parse(call.inputJson) : {};
    } catch (err) {
      return errorResult(
        call,
        `Invalid inputJson: ${err instanceof Error ? err.message : String(err)}`,
        Date.now() - startedAt,
      );
    }

    try {
      const output = await handler(parsedInput, ctx);
      return {
        callId: call.callId,
        toolName: call.toolName,
        outputJson: JSON.stringify(output),
        isError: false,
        usage: makeEstimatedUsage(Date.now() - startedAt),
      };
    } catch (err) {
      return errorResult(
        call,
        err instanceof Error ? err.message : String(err),
        Date.now() - startedAt,
      );
    }
  }

  async snapshot(_vm: VmHandle, _name: string): Promise<VmSnapshotHandle> {
    throw new KernelNotImplementedError("snapshot", this.backendId);
  }

  async fork(
    _snapshot: VmSnapshotHandle,
    _spec: ForkSpec,
    _ctx: KernelContext,
  ): Promise<VmHandle> {
    throw new KernelNotImplementedError("fork", this.backendId);
  }

  async hibernate(_vm: VmHandle): Promise<void> {
    throw new KernelNotImplementedError("hibernate", this.backendId);
  }

  async resume(_vm: VmHandle): Promise<VmHandle> {
    throw new KernelNotImplementedError("resume", this.backendId);
  }

  async destroy(_vm: VmHandle): Promise<void> {
    // No-op: in-process has no backend resources to release.
  }
}

function errorResult(
  call: ToolCall,
  message: string,
  durationMs: number,
): ToolResult {
  return {
    callId: call.callId,
    toolName: call.toolName,
    outputJson: JSON.stringify({ error: message }),
    isError: true,
    usage: makeEstimatedUsage(durationMs),
  };
}

function makeEstimatedUsage(durationMs: number): ResourceUsage {
  return {
    cpuMs: 0,
    memPeakKb: 0,
    egressBytes: 0,
    durationMs,
    syscallCount: 0,
    confidence: "estimated",
  };
}
