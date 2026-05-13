// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IntentRenderer } from "../IntentRenderer";

describe("IntentRenderer", () => {
  const sid = "test-sid";

  afterEach(() => {
    cleanup();
  });

  it("renders ProseIntent for kind=prose", () => {
    render(
      <IntentRenderer
        node={
          {
            id: "n1",
            intent: { kind: "prose", text: "hello", author: "agent" },
          } as never
        }
        sid={sid}
      />,
    );
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("renders UnknownIntent for unknown kind", () => {
    render(
      <IntentRenderer
        node={
          {
            id: "n2",
            intent: { kind: "future_intent_kind" },
          } as never
        }
        sid={sid}
      />,
    );
    expect(
      screen.getByText(/unrendered intent: future_intent_kind/i),
    ).toBeTruthy();
  });

  it("renders ToolCallIntent for kind=tool_call", () => {
    render(
      <IntentRenderer
        node={
          {
            id: "n3",
            intent: {
              kind: "tool_call",
              tool: "fs.read",
              args: { path: "x.md" },
            },
          } as never
        }
        sid={sid}
      />,
    );
    expect(screen.getByText(/fs\.read/)).toBeTruthy();
  });
});
