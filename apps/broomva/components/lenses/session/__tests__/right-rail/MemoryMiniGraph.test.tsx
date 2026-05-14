// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../../SceneContext";
import { MemoryMiniGraph } from "../../right-rail/MemoryMiniGraph";

afterEach(() => cleanup());

const wrap = (scene: unknown) =>
  render(
    <SceneContextProvider
      value={{
        scene: scene as never,
        dispatch: () => {},
        connected: true,
        lastSeq: 1n,
      }}
    >
      <MemoryMiniGraph />
    </SceneContextProvider>,
  );

describe("MemoryMiniGraph", () => {
  it("renders empty state when no memory events", () => {
    wrap({ id: "s", root: { id: "root", intent: { type: "section" } } });
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders touched labels from memory.* tool_calls", () => {
    wrap({
      id: "s",
      root: {
        id: "root",
        intent: { type: "section" },
        children: [
          {
            id: "a",
            intent: {
              type: "tool_call",
              name: "memory.query",
              args: { scope: "aios-proposal" },
            },
          },
          {
            id: "b",
            intent: {
              type: "tool_call",
              name: "memory.write",
              args: { node: { label: "primitives" } },
            },
          },
        ],
      },
    });
    expect(screen.getByText("aios-proposal")).toBeTruthy();
    expect(screen.getByText("primitives")).toBeTruthy();
  });
});
