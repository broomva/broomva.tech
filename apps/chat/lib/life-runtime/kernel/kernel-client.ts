/**
 * Life Runtime — KernelClient interface.
 *
 * 1:1 with lifed's `KernelService` tonic contract
 * (core/life/crates/life-kernel/life-kernel-proto/proto/kernel.proto).
 *
 * Two interchangeable implementations:
 *   - InProcessKernelClient — tools dispatched inline in the Next.js runtime
 *   - LifedHttpKernelClient — routes over HTTPS to lifed-gateway (future PR)
 *
 * Consumers (RealAgentRunner, /prosopon route) depend only on this interface.
 * The factory (`./factory`) picks between impls based on `LIFED_GATEWAY_URL`.
 */

import type {
  ForkSpec,
  KernelContext,
  ToolCall,
  ToolResult,
  VmHandle,
  VmSnapshotHandle,
  VmSpec,
} from "./types";

export interface KernelClient {
  /** Backend identifier used for OTel attribution + envelope signals. */
  readonly backendId: string;

  /**
   * Create a VM (or in-process execution context) bound to the given
   * session. The returned handle is passed to subsequent dispatch/destroy
   * calls and may be persisted (JSON-serialisable) across turns.
   */
  createVm(spec: VmSpec, ctx: KernelContext): Promise<VmHandle>;

  /**
   * Dispatch a tool call. `call.inputJson` is opaque to the client; the
   * backend owns tool execution semantics. Errors are returned as
   * `ToolResult { isError: true }` rather than thrown so the AI SDK loop
   * can feed the error string back to the model.
   */
  dispatch(
    vm: VmHandle,
    call: ToolCall,
    ctx: KernelContext,
  ): Promise<ToolResult>;

  snapshot(vm: VmHandle, name: string): Promise<VmSnapshotHandle>;

  fork(
    snapshot: VmSnapshotHandle,
    spec: ForkSpec,
    ctx: KernelContext,
  ): Promise<VmHandle>;

  hibernate(vm: VmHandle): Promise<void>;

  resume(vm: VmHandle): Promise<VmHandle>;

  /** Destroy the VM. No-op on backends with no releasable resources. */
  destroy(vm: VmHandle): Promise<void>;
}

export class KernelNotImplementedError extends Error {
  constructor(method: string, backendId: string) {
    super(
      `KernelClient.${method} is not implemented on backend "${backendId}"`,
    );
    this.name = "KernelNotImplementedError";
  }
}
