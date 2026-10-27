import { NextResponse } from "next/server";
import { agentWorkspaces } from "@/lib/agent-workspaces";

export function GET(request: Request) {
  const incoming = new URL(request.url);
  const destination = new URL(
    `${agentWorkspaces.base}/deck/index.html`,
    incoming,
  );
  destination.search = incoming.search;
  return NextResponse.redirect(destination, 307);
}
