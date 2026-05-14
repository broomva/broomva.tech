"use client";

import { InContextCards } from "./InContextCards";
import { MemoryMiniGraph } from "./MemoryMiniGraph";
import { RecentOpsFeed } from "./RecentOpsFeed";

function RailHeading({ children, hint }: { children: string; hint?: string }) {
  return (
    <h6 className="mt-5 mb-2 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
      <span>{children}</span>
      {hint && <span className="opacity-70">{hint}</span>}
    </h6>
  );
}

/**
 * RightRailSession — three stacked panels surfaced when the Session lens
 * is active. Replaces the B-4a placeholder content of RightRail when the
 * workspace lens is `session`.
 */
export function RightRailSession() {
  return (
    <div className="px-3 pb-3">
      <RailHeading>In context</RailHeading>
      <InContextCards />

      <RailHeading>Memory · this session</RailHeading>
      <MemoryMiniGraph />

      <RailHeading hint="· live">Recent operations</RailHeading>
      <RecentOpsFeed />
    </div>
  );
}
