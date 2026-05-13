// @vitest-environment jsdom

import type { Scene } from "@broomva/prosopon";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../SceneContext";
import { SessionCanvas } from "../SessionCanvas";

/**
 * SessionCanvas reads `scene.root` (canonical) and flattens children via
 * DFS pre-order. We exercise both shapes here: a canonical scene with a
 * root container holding two prose children, and a degenerate empty
 * scene with a root whose intent is a no-op container.
 *
 * Discriminator: ProseIntent (and IntentRenderer) read `intent.type` first,
 * then fall back to `intent.kind`. We use `type` for the prose children
 * here to match canonical shape; the test is robust either way.
 */

function wrap(scene: Scene) {
  return render(
    <SceneContextProvider
      value={{ scene, dispatch: () => {}, connected: true, lastSeq: 1n }}
    >
      <SessionCanvas sid="abc" />
    </SceneContextProvider>,
  );
}

describe("SessionCanvas", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders prose nodes in DFS pre-order", () => {
    const scene = {
      id: "abc",
      root: {
        id: "root",
        intent: { type: "section", title: null },
        children: [
          {
            id: "a",
            intent: { type: "prose", text: "first", author: "user" },
          },
          {
            id: "b",
            intent: { type: "prose", text: "second", author: "agent" },
          },
        ],
      },
    } as unknown as Scene;

    wrap(scene);
    // Both prose payloads should render; order is preserved by DFS walk.
    const first = screen.getByText("first");
    const second = screen.getByText("second");
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    // Ordering check: the first prose's compareDocumentPosition must
    // report "follows" for the second prose (i.e. first appears before
    // second in the DOM).
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders empty placeholder when the flattened tree is empty", () => {
    // No root → flattenNodes returns []; placeholder renders.
    const scene = {
      id: "abc",
      // `root` intentionally undefined; canonical Scene requires it, but
      // useSessionStream starts with an EMPTY_SCENE that has a stub root
      // and the canvas should still render the placeholder until a real
      // scene arrives. To exercise the empty path deterministically we
      // pass a Scene whose root is undefined via a cast.
      root: undefined,
    } as unknown as Scene;
    wrap(scene);
    expect(screen.getByText(/waiting/i)).toBeTruthy();
  });
});
