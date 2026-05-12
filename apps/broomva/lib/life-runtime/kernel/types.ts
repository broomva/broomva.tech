/**
 * Life Runtime — KernelClient contract types.
 *
 * Hand-written TS mirrors of the `broomva.life.kernel.v1` proto messages
 * that the `/life` surface consumes from `lifed`. Aligned 1:1 with lifed's
 * `KernelService` tonic contract so a future `LifedHttpKernelClient` can
 * slot in behind the factory with zero shape change to callers.
 *
 * Keeping these hand-mirrored (rather than generating from the `.proto`)
 * is deliberate: 7 RPCs + ~10 message types is smaller than a codegen
 * toolchain, and drift is a single review pass every time lifed bumps a
 * minor version.
 *
 * Spec: docs/superpowers/specs/2026-04-24-life-kernel-client-integration.md
 */

export type BackendId = "in-process" | "local" | "cube" | "vercel" | string;

export interface WalletRef {
  address: string;
  chainCaip2: string;
}

export interface ResourceBudget {
  maxCpuMs?: number;
  maxMemKb?: number;
  maxEgressBytes?: number;
  maxCostCents?: number;
}

export interface TraceContext {
  traceparent: string;
  tracestate?: string;
}

export interface KernelContext {
  sessionId: string;
  agentId: string;
  wallet?: WalletRef;
  costHint?: ResourceBudget;
  traceCtx?: TraceContext;
}

export type VmState =
  | "starting"
  | "running"
  | "hibernated"
  | "snapshotted"
  | "stopping"
  | "stopped"
  | "failed";

export interface VmStatus {
  state: VmState;
  reason?: string;
}

export interface VmHandle {
  vmId: string;
  backend: BackendId;
  sessionId: string;
  agentId: string;
  status: VmStatus;
  createdAt: string;
  metadataJson: string;
}

export interface VmSpec {
  backendHint?: BackendId;
  toolAllowlist?: string[];
  metadataJson?: string;
}

export interface ForkSpec {
  backendHint?: BackendId;
  metadataJson?: string;
}

export interface VmSnapshotHandle {
  snapshotId: string;
  vmId: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
}

export interface ToolCall {
  callId: string;
  toolName: string;
  inputJson: string;
  requestedCapabilities: string[];
}

export type ResourceUsageConfidence = "measured" | "estimated" | "unknown";

export interface ResourceUsage {
  cpuMs: number;
  memPeakKb: number;
  egressBytes: number;
  durationMs: number;
  syscallCount: number;
  confidence: ResourceUsageConfidence;
}

export interface ToolResult {
  callId: string;
  toolName: string;
  outputJson: string;
  isError: boolean;
  usage?: ResourceUsage;
}
