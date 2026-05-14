// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../../session/SceneContext";
import { AgentsLens } from "../AgentsLens";

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
      <AgentsLens />
    </SceneContextProvider>,
  );

describe("AgentsLens", () => {
  it("renders empty state when scene has no agent specs", () => {
    wrap({ id: "s", root: { id: "root", intent: { type: "section" } } });
    expect(screen.getByText(/no agents installed yet/i)).toBeTruthy();
  });

  it("renders an AgentCard per agents/*/spec.md fs.write", () => {
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
              name: "fs.write",
              args: {
                path: "agents/broomva/spec.md",
                frontmatter: { name: "Broomva", archetype: "resident" },
              },
            },
          },
        ],
      },
    });
    expect(screen.getByText("Broomva")).toBeTruthy();
    expect(screen.getByText("1 installed")).toBeTruthy();
  });
});
