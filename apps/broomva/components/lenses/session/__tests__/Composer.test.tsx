// @vitest-environment jsdom

import type { Scene } from "@broomva/prosopon";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../Composer";
import { SceneContextProvider } from "../SceneContext";

/**
 * Composer reads `lastSeq` from SceneContext to display the seq counter
 * in its hint footer. Each test wraps it in a minimal provider with a
 * canonical empty scene.
 */
const emptyScene = {
  id: "abc",
  root: { id: "root", intent: { type: "prose", text: "" } },
  signals: {},
} as unknown as Scene;

function renderComposer(sid = "abc") {
  return render(
    <SceneContextProvider
      value={{
        scene: emptyScene,
        dispatch: () => {},
        connected: true,
        lastSeq: 0n,
      }}
    >
      <Composer sid={sid} />
    </SceneContextProvider>,
  );
}

describe("Composer", () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 202 }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as unknown as { fetch?: typeof fetch }).fetch;
  });

  it("renders the textarea + send button", () => {
    renderComposer();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: /send/i })).toBeTruthy();
  });

  it("POSTs to send-message on click with the textarea value", async () => {
    renderComposer();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "hello atlas" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(
        (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch,
      ).toHaveBeenCalledWith(
        "/api/life-proxy/agent/send-message",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ sid: "abc", content: "hello atlas" }),
        }),
      ),
    );
  });

  it("POSTs on Cmd+Enter", async () => {
    renderComposer();
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "hi" } });
    fireEvent.keyDown(ta, { key: "Enter", metaKey: true });
    await waitFor(() =>
      expect(
        (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch,
      ).toHaveBeenCalledWith(
        "/api/life-proxy/agent/send-message",
        expect.anything(),
      ),
    );
  });

  it("does not POST on empty input", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(
      (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch,
    ).not.toHaveBeenCalled();
  });

  it("opens the file picker when @ is typed", async () => {
    render(
      <SceneContextProvider
        value={{
          scene: emptyScene,
          dispatch: () => {},
          connected: true,
          lastSeq: 0n,
        }}
      >
        <Composer sid="abc" />
      </SceneContextProvider>,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "@" } });
    await waitFor(() =>
      expect(screen.getByRole("listbox", { name: /files/i })).toBeTruthy(),
    );
  });

  it("opens the tool picker when / is typed", async () => {
    render(
      <SceneContextProvider
        value={{
          scene: emptyScene,
          dispatch: () => {},
          connected: true,
          lastSeq: 0n,
        }}
      >
        <Composer sid="abc" />
      </SceneContextProvider>,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "/" } });
    await waitFor(() =>
      expect(screen.getByRole("listbox", { name: /tools/i })).toBeTruthy(),
    );
  });

  it("opens the context picker when + context is clicked", async () => {
    render(
      <SceneContextProvider
        value={{
          scene: emptyScene,
          dispatch: () => {},
          connected: true,
          lastSeq: 0n,
        }}
      >
        <Composer sid="abc" />
      </SceneContextProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /\+ context/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /add context/i })).toBeTruthy(),
    );
  });
});
