import { buildContentSecurityPolicy } from "./content-security-policy";

// Presenter view embeds only this same-origin release document. Keep the
// exception off the landing page, downloads, and every other site route.
export const AGENT_WORKSPACES_DECK_SOURCE =
  "/agent-workspaces/:version(v[0-9]+\\.[0-9]+\\.[0-9]+)/deck/index.html";

export function isAgentWorkspacesDeckDocument(pathname: string): boolean {
  return /^\/agent-workspaces\/v[0-9]+\.[0-9]+\.[0-9]+\/deck\/index\.html$/.test(
    pathname,
  );
}

export const agentWorkspacesFrameHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy().replace(
      "frame-ancestors 'none'",
      "frame-ancestors 'self'",
    ),
  },
];
