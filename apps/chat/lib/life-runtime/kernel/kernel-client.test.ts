// Phase A regression net for the KernelClient contract. Exercises the
// in-process backend end-to-end (createVm → dispatch → destroy), error
// paths (unknown tool, handler throws, bad inputJson), and the "not yet
// implemented" semantics for snapshot/fork/hibernate/resume.
//
// These tests stand in for the conformance battery that will live in
// lifed's `life-kernel-conformance` crate once Phase D (LifedHttpKernelClient)
// ships — the in-process impl must pass the same contract.

import { describe, expect, it, vi } from "vitest";

import { createKernelClient } from "./factory";
import { InProcessKernelClient } from "./in-process-client";
import type { KernelContext } from "./types";

const ctx: KernelContext = {
  sessionId: "sess-test",
  agentId: "agent-test",
};

describe("InProcessKernelClient", () => {
  it("backendId is the stable 'in-process' string", () => {
    const client = new InProcessKernelClient({ tools: {} });
    expect(client.backendId).toBe("in-process");
  });

  it("createVm returns a running handle bound to the caller's session", async () => {
    const client = new InProcessKernelClient({ tools: {} });
    const vm = await client.createVm(
      { backendHint: "in-process", toolAllowlist: ["note"] },
      ctx,
    );
    expect(vm.status.state).toBe("running");
    expect(vm.backend).toBe("in-process");
    expect(vm.sessionId).toBe("sess-test");
    expect(vm.agentId).toBe("agent-test");
    expect(vm.vmId).toMatch(/^[0-9a-f-]{36}$/);
    expect(vm.metadataJson).toBe("{}");
  });

  it("createVm passes through metadataJson when supplied", async () => {
    const client = new InProcessKernelClient({ tools: {} });
    const vm = await client.createVm(
      { metadataJson: JSON.stringify({ lifeTurn: "t1" }) },
      ctx,
    );
    expect(JSON.parse(vm.metadataJson)).toEqual({ lifeTurn: "t1" });
  });

  it("dispatch routes to the registered handler with parsed input + ctx", async () => {
    const handler = vi.fn(async (input: unknown) => ({
      received: input,
      ok: true,
    }));
    const client = new InProcessKernelClient({ tools: { note: handler } });
    const vm = await client.createVm({}, ctx);
    const result = await client.dispatch(
      vm,
      {
        callId: "call_1",
        toolName: "note",
        inputJson: JSON.stringify({ slug: "x", title: "T", body: "B" }),
        requestedCapabilities: [],
      },
      ctx,
    );
    expect(result.callId).toBe("call_1");
    expect(result.toolName).toBe("note");
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.outputJson)).toEqual({
      received: { slug: "x", title: "T", body: "B" },
      ok: true,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { slug: "x", title: "T", body: "B" },
      ctx,
    );
  });

  it("dispatch attaches estimated ResourceUsage with measured duration", async () => {
    const client = new InProcessKernelClient({
      tools: {
        slow: async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { ok: true };
        },
      },
    });
    const vm = await client.createVm({}, ctx);
    const result = await client.dispatch(
      vm,
      {
        callId: "call_slow",
        toolName: "slow",
        inputJson: "{}",
        requestedCapabilities: [],
      },
      ctx,
    );
    expect(result.usage?.confidence).toBe("estimated");
    expect(result.usage?.durationMs).toBeGreaterThanOrEqual(1);
    // Non-duration fields are surfaced as zero under the "estimated"
    // confidence label — the proto contract says "don't lie", and the
    // in-process backend has no way to measure these.
    expect(result.usage?.cpuMs).toBe(0);
    expect(result.usage?.memPeakKb).toBe(0);
    expect(result.usage?.egressBytes).toBe(0);
    expect(result.usage?.syscallCount).toBe(0);
  });

  it("dispatch returns isError=true with message when handler throws", async () => {
    const client = new InProcessKernelClient({
      tools: {
        broken: async () => {
          throw new Error("boom");
        },
      },
    });
    const vm = await client.createVm({}, ctx);
    const result = await client.dispatch(
      vm,
      {
        callId: "call_err",
        toolName: "broken",
        inputJson: "{}",
        requestedCapabilities: [],
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.outputJson)).toEqual({ error: "boom" });
    expect(result.usage).toBeDefined();
  });

  it("dispatch returns isError=true on unknown tool", async () => {
    const client = new InProcessKernelClient({ tools: {} });
    const vm = await client.createVm({}, ctx);
    const result = await client.dispatch(
      vm,
      {
        callId: "call_unknown",
        toolName: "nonexistent",
        inputJson: "{}",
        requestedCapabilities: [],
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.outputJson).error).toMatch(/unknown tool/i);
  });

  it("dispatch returns isError=true on malformed inputJson", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const client = new InProcessKernelClient({ tools: { note: handler } });
    const vm = await client.createVm({}, ctx);
    const result = await client.dispatch(
      vm,
      {
        callId: "call_bad",
        toolName: "note",
        inputJson: "{not-json",
        requestedCapabilities: [],
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.outputJson).error).toMatch(/invalid inputjson/i);
    // Handler is never invoked with garbage input.
    expect(handler).not.toHaveBeenCalled();
  });

  it("destroy is a no-op", async () => {
    const client = new InProcessKernelClient({ tools: {} });
    const vm = await client.createVm({}, ctx);
    await expect(client.destroy(vm)).resolves.toBeUndefined();
  });

  it("snapshot/fork/hibernate/resume throw KernelNotImplementedError", async () => {
    const client = new InProcessKernelClient({ tools: {} });
    const vm = await client.createVm({}, ctx);
    await expect(client.snapshot(vm, "snap-1")).rejects.toThrow(
      /not implemented/i,
    );
    await expect(client.hibernate(vm)).rejects.toThrow(/not implemented/i);
    await expect(client.resume(vm)).rejects.toThrow(/not implemented/i);
    await expect(
      client.fork(
        {
          snapshotId: "snap-1",
          vmId: vm.vmId,
          name: "s",
          createdAt: vm.createdAt,
          sizeBytes: 0,
        },
        {},
        ctx,
      ),
    ).rejects.toThrow(/not implemented/i);
  });
});

describe("createKernelClient factory", () => {
  it("returns InProcessKernelClient when LIFED_GATEWAY_URL is unset", () => {
    const prior = process.env.LIFED_GATEWAY_URL;
    delete process.env.LIFED_GATEWAY_URL;
    try {
      const client = createKernelClient({ tools: {} });
      expect(client).toBeInstanceOf(InProcessKernelClient);
      expect(client.backendId).toBe("in-process");
    } finally {
      if (prior !== undefined) process.env.LIFED_GATEWAY_URL = prior;
    }
  });

  it("throws when LIFED_GATEWAY_URL is set (LifedHttpKernelClient = Phase D)", () => {
    const prior = process.env.LIFED_GATEWAY_URL;
    process.env.LIFED_GATEWAY_URL = "https://lifed-gw.example.com";
    try {
      expect(() => createKernelClient({ tools: {} })).toThrow(
        /not implemented/i,
      );
    } finally {
      if (prior === undefined) delete process.env.LIFED_GATEWAY_URL;
      else process.env.LIFED_GATEWAY_URL = prior;
    }
  });
});
