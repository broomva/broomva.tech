// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../../SceneContext";
import { RecentOpsFeed } from "../../right-rail/RecentOpsFeed";

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
      <RecentOpsFeed />
    </SceneContextProvider>,
  );

describe("RecentOpsFeed", () => {
  it("shows empty state with no tool_calls", () => {
    wrap({ id: "s", root: { id: "root", intent: { type: "section" } } });
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders fs/memory tool_calls and not other intents", () => {
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
              name: "fs.read",
              args: { path: "x.md" },
            },
          },
          {
            id: "b",
            intent: {
              type: "tool_call",
              name: "memory.query",
              args: { scope: "s" },
            },
          },
          { id: "c", intent: { type: "prose", text: "hello" } },
        ],
      },
    });
    expect(screen.getByText("fs.read")).toBeTruthy();
    expect(screen.getByText("memory.query")).toBeTruthy();
  });

  it("caps the rendered list at 14 entries (newest first)", () => {
    // 20 fs.read tool_calls pre-order. useRecentOps pushes in pre-order
    // (op-0 … op-19), then reverses (op-19 … op-0), then slice(0, 14).
    // Result: op-19 … op-6 are visible; op-5 and below are dropped.
    const ops = Array.from({ length: 20 }, (_, i) => ({
      id: `op-${i}`,
      intent: {
        type: "tool_call",
        name: "fs.read",
        args: { path: `f${i}.md` },
      },
    }));
    wrap({
      id: "s",
      root: { id: "root", intent: { type: "section" }, children: ops },
    });
    // Newest entry is visible.
    expect(screen.getByText("f19.md")).toBeTruthy();
    // 15th-newest (op-5, path f5.md) falls outside the cap.
    expect(screen.queryByText("f5.md")).toBeNull();
  });
});
