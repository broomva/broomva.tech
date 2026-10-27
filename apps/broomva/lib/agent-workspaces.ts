const version = "1.1.0";

export const agentWorkspaces = {
  version,
  repository: "https://github.com/broomva/agent-workspaces",
  base: `/agent-workspaces/v${version}`,
  deck: "/agent-workspaces/deck/",
} as const;
