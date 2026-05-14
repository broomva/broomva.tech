// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentCard } from "../AgentCard";
import type { AgentSpec } from "../useAgents";

afterEach(() => cleanup());

const spec: AgentSpec = {
  id: "broomva",
  path: "agents/broomva/spec.md",
  name: "Broomva",
  archetype: "resident",
  description: "Resident agent of this workspace.",
  model: "claude-sonnet-4.5",
  grants: ["fs.read", "fs.write"],
  approvalMode: "silent",
  eventId: "evt-1",
};

describe("AgentCard", () => {
  it("renders name, archetype, description, model, and one chip per grant", () => {
    render(<AgentCard spec={spec} />);
    expect(screen.getByText("Broomva")).toBeTruthy();
    expect(screen.getByText("resident")).toBeTruthy();
    expect(screen.getByText("Resident agent of this workspace.")).toBeTruthy();
    expect(screen.getByText("claude-sonnet-4.5")).toBeTruthy();
    expect(screen.getByText("fs.read")).toBeTruthy();
    expect(screen.getByText("fs.write")).toBeTruthy();
  });

  it("shows 'no grants' when grants array is empty", () => {
    render(<AgentCard spec={{ ...spec, grants: [] }} />);
    expect(screen.getByText("no grants")).toBeTruthy();
  });

  it("points href at the spec file for Files-lens preview", () => {
    const { container } = render(<AgentCard spec={spec} />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe(
      `?file=${encodeURIComponent("agents/broomva/spec.md")}`,
    );
  });
});
