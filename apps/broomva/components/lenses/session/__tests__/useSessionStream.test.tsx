// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSessionStream } from "../useSessionStream";

// Mock EventSource — jsdom does not implement it.
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onopen: ((ev: Event) => void) | null = null;
  readyState = 0;
  CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close() {
    this.readyState = this.CLOSED;
  }
  emit(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }
}

describe("useSessionStream", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    delete (globalThis as any).EventSource;
  });

  it("opens an EventSource at /api/life-proxy/sse/[sid]?from_seq=0 by default", () => {
    renderHook(() => useSessionStream({ sid: "abc" }));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain(
      "/api/life-proxy/sse/abc",
    );
    expect(MockEventSource.instances[0].url).toContain("from_seq=0");
  });

  it("advances lastSeq when envelopes arrive", async () => {
    const { result } = renderHook(() => useSessionStream({ sid: "abc" }));
    act(() => {
      MockEventSource.instances[0].emit({
        version: 1,
        session_id: "abc",
        seq: 5,
        ts: new Date().toISOString(),
        event: {
          type: "scene_reset",
          scene: {
            id: "abc",
            root: { id: "root", intent: { type: "prose", text: "" } },
            signals: {},
          },
        },
      });
    });
    await waitFor(() => expect(result.current.lastSeq).toBe(5n));
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useSessionStream({ sid: "abc" }));
    const instance = MockEventSource.instances[0];
    unmount();
    expect(instance.readyState).toBe(instance.CLOSED);
  });
});
