// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../../SceneContext";
import { InContextCards } from "../../right-rail/InContextCards";

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
      <InContextCards />
    </SceneContextProvider>,
  );

describe("InContextCards", () => {
  it("shows empty-state when no references in scene", () => {
    wrap({ id: "s", root: { id: "root", intent: { type: "section" } } });
    expect(screen.getByText(/start a session to populate/i)).toBeTruthy();
  });

  it("derives one card per fs.* tool_call with a path arg", () => {
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
              args: { path: "notes/x.md" },
            },
          },
          {
            id: "b",
            intent: {
              type: "tool_call",
              name: "fs.write",
              args: { path: "welcome.md" },
            },
          },
        ],
      },
    });
    expect(screen.getByText("notes/x.md")).toBeTruthy();
    expect(screen.getByText("welcome.md")).toBeTruthy();
  });

  it("dedupes references to the same path", () => {
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
              name: "fs.read",
              args: { path: "x.md" },
            },
          },
        ],
      },
    });
    expect(screen.getAllByText("x.md")).toHaveLength(1);
  });
});
