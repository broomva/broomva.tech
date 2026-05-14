// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../../session/SceneContext";
import { useFilesTree } from "../useFilesTree";

afterEach(() => cleanup());

const wrap =
  (scene: unknown): ((p: { children: ReactNode }) => ReactElement) =>
  ({ children }) => (
    <SceneContextProvider
      value={{
        scene: scene as never,
        dispatch: () => {},
        connected: true,
        lastSeq: 1n,
      }}
    >
      {children}
    </SceneContextProvider>
  );

describe("useFilesTree", () => {
  it("returns empty tree when scene has no fs.write events", () => {
    const { result } = renderHook(() => useFilesTree(), {
      wrapper: wrap({ id: "s", root: { id: "root", intent: { type: "section" } } }),
    });
    expect(result.current.files).toHaveLength(0);
    expect(result.current.root.children).toHaveLength(0);
  });

  it("derives one entry per unique path", () => {
    const { result } = renderHook(() => useFilesTree(), {
      wrapper: wrap({
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
            {
              id: "b",
              intent: {
                type: "tool_call",
                name: "fs.write",
                args: { path: "notes/quickstart.md" },
              },
            },
          ],
        },
      }),
    });
    expect(result.current.files.map((f) => f.path)).toEqual([
      "notes/quickstart.md",
      "welcome.md",
    ]);
  });

  it("dedupes multiple writes to the same path (latest wins)", () => {
    const { result } = renderHook(() => useFilesTree(), {
      wrapper: wrap({
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
                args: { path: "x.md" },
              },
            },
            {
              id: "b",
              intent: {
                type: "tool_call",
                name: "fs.write",
                args: { path: "x.md" },
              },
            },
          ],
        },
      }),
    });
    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].id).toBe("b");
  });

  it("groups nested paths into folders", () => {
    const { result } = renderHook(() => useFilesTree(), {
      wrapper: wrap({
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
                args: { path: "notes/quickstart.md" },
              },
            },
            {
              id: "b",
              intent: {
                type: "tool_call",
                name: "fs.write",
                args: { path: "notes/deep/inner.md" },
              },
            },
          ],
        },
      }),
    });
    const notes = result.current.root.children[0];
    expect(notes.kind).toBe("folder");
    if (notes.kind === "folder") {
      expect(notes.name).toBe("notes");
      // children: [deep/, quickstart.md] (folders first)
      expect(notes.children).toHaveLength(2);
      expect(notes.children[0].kind).toBe("folder");
    }
  });
});
