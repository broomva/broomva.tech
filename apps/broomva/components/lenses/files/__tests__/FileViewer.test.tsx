// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../../session/SceneContext";
import { FileViewer } from "../FileViewer";

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
      <FileViewer path={path} />
    </SceneContextProvider>,
  );

describe("FileViewer", () => {
  it("shows the missing-write message when no fs.write event matches", () => {
    wrap(
      { id: "s", root: { id: "root", intent: { type: "section" } } },
      "ghost.md",
    );
    expect(screen.getByText(/no write event yet/i)).toBeTruthy();
  });

  it("renders the markdown body and frontmatter when the file exists", () => {
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
                  path: "welcome.md",
                  content: "# Hello\n\nBody paragraph here.",
                  frontmatter: { kind: "doc", tags: ["welcome"] },
                },
              },
            },
          ],
        },
      },
      "welcome.md",
    );
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByText("Body paragraph here.")).toBeTruthy();
    expect(screen.getByText("doc")).toBeTruthy();
    expect(screen.getByText("#welcome")).toBeTruthy();
  });
});
