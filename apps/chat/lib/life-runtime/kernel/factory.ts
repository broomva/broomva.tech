/**
 * Life Runtime — KernelClient factory.
 *
 * Picks between `InProcessKernelClient` (default) and `LifedHttpKernelClient`
 * (Phase D — not implemented) based on the `LIFED_GATEWAY_URL` environment
 * variable. Callers never instantiate a client directly, so swapping backends
 * is a config change, not a refactor.
 */

import {
  InProcessKernelClient,
  type InProcessKernelClientOptions,
} from "./in-process-client";
import type { KernelClient } from "./kernel-client";

export function createKernelClient(
  opts: InProcessKernelClientOptions,
): KernelClient {
  if (process.env.LIFED_GATEWAY_URL) {
    throw new Error(
      "LifedHttpKernelClient is not implemented yet. " +
        "Unset LIFED_GATEWAY_URL to fall back to InProcessKernelClient, " +
        "or ship Phase D per docs/superpowers/specs/2026-04-24-life-kernel-client-integration.md.",
    );
  }
  return new InProcessKernelClient(opts);
}
