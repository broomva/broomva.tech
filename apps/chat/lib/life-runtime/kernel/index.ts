/**
 * Life Runtime — KernelClient barrel.
 *
 * Single import point for callers (RealAgentRunner, /prosopon route, tests):
 *
 *   import { createKernelClient, type KernelClient } from "@/lib/life-runtime/kernel";
 */

export { createKernelClient } from "./factory";
export {
  InProcessKernelClient,
  type InProcessKernelClientOptions,
  type ToolHandler,
} from "./in-process-client";
export {
  type KernelClient,
  KernelNotImplementedError,
} from "./kernel-client";
export type {
  BackendId,
  ForkSpec,
  KernelContext,
  ResourceBudget,
  ResourceUsage,
  ResourceUsageConfidence,
  ToolCall,
  ToolResult,
  TraceContext,
  VmHandle,
  VmSnapshotHandle,
  VmSpec,
  VmState,
  VmStatus,
  WalletRef,
} from "./types";
