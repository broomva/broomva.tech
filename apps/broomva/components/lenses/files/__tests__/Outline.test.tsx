// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../../session/SceneContext";
import { Outline } from "../Outline";

afterEach(() => cleanup());

const wrap = (scene: unknown, path: string) =>
  render(
    <SceneContextProvider
      value={{
        scene: scene as never,
        dispatch: () => {},
        connected: true,
        lastSeq: 1n,
      }}
    >
      <Outline path={path} />
    </SceneContextProvider>,
  );

describe("Outline", () => {
  it("renders empty state when the file has no headings", () => {
    wrap(
      {
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
                args: { path: "x.md", content: "Just a paragraph." },
              },
            },
          ],
        },
      },
      "x.md",
    );
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("extracts headings from the file body", () => {
    wrap(
      {
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
                  path: "x.md",
                  content: "# Top\n\n## Mid\n\n### Inner\n\nbody",
                },
              },
            },
          ],
        },
      },
      "x.md",
    );
    expect(screen.getByText("Top")).toBeTruthy();
    expect(screen.getByText("Mid")).toBeTruthy();
    expect(screen.getByText("Inner")).toBeTruthy();
  });
});
