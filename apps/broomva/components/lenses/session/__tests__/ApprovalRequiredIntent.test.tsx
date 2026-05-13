// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalRequiredIntent } from "../intents/ApprovalRequiredIntent";

describe("ApprovalRequiredIntent", () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 202 }),
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    cleanup();
    delete (globalThis as unknown as { fetch?: typeof fetch }).fetch;
  });

  const node = {
    id: "n_1",
    intent: {
      kind: "approval_required",
      dispatch_id: "ad_0814",
      summary: "Atlas wants to write welcome.md with 412 bytes.",
    },
  } as never;

  it("renders the summary and the dispatch id", () => {
    render(<ApprovalRequiredIntent node={node} sid="abc" />);
    expect(screen.getByText(/wants to write welcome.md/i)).toBeTruthy();
    expect(screen.getByText(/ad_0814/i)).toBeTruthy();
  });

  it("POSTs to /api/life-proxy/agent/approve-dispatch on Approve", () => {
    render(<ApprovalRequiredIntent node={node} sid="abc" />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(
      (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch,
    ).toHaveBeenCalledWith(
      "/api/life-proxy/agent/approve-dispatch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sid: "abc", dispatchId: "ad_0814" }),
      }),
    );
  });

  it("POSTs to /api/life-proxy/agent/cancel-dispatch on Deny", () => {
    render(<ApprovalRequiredIntent node={node} sid="abc" />);
    fireEvent.click(screen.getByRole("button", { name: /deny/i }));
    expect(
      (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch,
    ).toHaveBeenCalledWith(
      "/api/life-proxy/agent/cancel-dispatch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sid: "abc",
          dispatchId: "ad_0814",
          reason: "user_denied",
        }),
      }),
    );
  });
});
