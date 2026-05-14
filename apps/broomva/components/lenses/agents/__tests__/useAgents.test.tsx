// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneContextProvider } from "../../session/SceneContext";
import { useAgents } from "../useAgents";

afterEach(() => cleanup());

const wrap =
  (scene: unknown) =>
  ({ children }: { children: ReactNode }): ReactElement => (
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

describe("useAgents", () => {
  it("returns empty list when no agents/*/spec.md fs.write events exist", () => {
    const { result } = renderHook(() => useAgents(), {
      wrapper: wrap({
        id: "s",
        root: { id: "root", intent: { type: "section" } },
      }),
    });
    expect(result.current).toHaveLength(0);
  });

  it("derives one AgentSpec per agents/<id>/spec.md fs.write", () => {
    const { result } = renderHook(() => useAgents(), {
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
                args: {
                  path: "agents/atlas/spec.md",
                  frontmatter: {
                    name: "Atlas",
                    archetype: "resident",
                    description: "Resident agent",
                    model: "claude-sonnet-4.5",
                    grants: ["fs.read", "fs.write"],
                    approval_mode: "silent",
                  },
                },
              },
            },
            {
              id: "b",
              intent: {
                type: "tool_call",
                name: "fs.write",
                args: {
                  path: "agents/builder/spec.md",
                  frontmatter: {
                    name: "Builder",
                    archetype: "engineer",
                    grants: ["fs.read", "fs.write", "bash"],
                    approval_mode: "review",
                  },
                },
              },
            },
          ],
        },
      }),
    });
    expect(result.current).toHaveLength(2);
    expect(result.current.map((a) => a.name)).toEqual(["Atlas", "Builder"]);
    const atlas = result.current[0];
    expect(atlas.archetype).toBe("resident");
    expect(atlas.grants).toEqual(["fs.read", "fs.write"]);
    expect(atlas.approvalMode).toBe("silent");
  });

  it("ignores fs.write events outside the agents/*/spec.md pattern", () => {
    const { result } = renderHook(() => useAgents(), {
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
                args: { path: "agents/atlas/notes.md" },
              },
            },
          ],
        },
      }),
    });
    expect(result.current).toHaveLength(0);
  });

  it("normalizes invalid approval_mode to 'silent'", () => {
    const { result } = renderHook(() => useAgents(), {
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
                args: {
                  path: "agents/foo/spec.md",
                  frontmatter: { approval_mode: "yolo" },
                },
              },
            },
          ],
        },
      }),
    });
    expect(result.current[0].approvalMode).toBe("silent");
  });
});
