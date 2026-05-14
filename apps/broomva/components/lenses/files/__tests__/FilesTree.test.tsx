// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneContextProvider } from "../../session/SceneContext";
import { FilesTree } from "../FilesTree";

afterEach(() => cleanup());

// Mock next/navigation. The FilesTree imports usePathname/useRouter/useSearchParams.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/workspace/test-sid",
  useSearchParams: () => new URLSearchParams(""),
}));

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
      <FilesTree />
    </SceneContextProvider>,
  );

describe("FilesTree", () => {
  it("shows 'Empty.' when the scene has no fs.write events", () => {
    wrap({ id: "s", root: { id: "root", intent: { type: "section" } } });
    expect(screen.getByText("Empty.")).toBeTruthy();
  });

  it("renders one file row per scene file", () => {
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
              args: { path: "welcome.md" },
            },
          },
        ],
      },
    });
    expect(screen.getByText("welcome.md")).toBeTruthy();
  });

  it("pushes the new URL when a file is clicked", () => {
    pushMock.mockClear();
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
              args: { path: "welcome.md" },
            },
          },
        ],
      },
    });
    fireEvent.click(screen.getByText("welcome.md"));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(String(pushMock.mock.calls[0][0])).toContain("file=welcome.md");
  });
});
