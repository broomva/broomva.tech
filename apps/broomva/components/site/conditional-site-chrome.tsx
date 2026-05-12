"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ToolbarDockProvider } from "@/components/site/toolbar-dock-context";
import { SiteHeader } from "@/components/site/site-header";
import { TopNav } from "@/components/site/top-nav";
import { ConditionalFooter } from "@/components/site/conditional-footer";

/**
 * Paths that opt OUT of the standard site chrome (header / top-nav / footer /
 * padding) and run in their own full-viewport shell. These are full-surface
 * experiences — e.g. /life/[project]'s three-column agent workspace — that
 * need every pixel and can't coexist with the site's header/footer overlays.
 */
const BARE_PATHS = ["/life"];

function isBarePath(pathname: string): boolean {
  return BARE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renders either the standard site layout (header + top-nav + footer +
 * responsive padding) OR a bare pass-through for experiences that need the
 * full viewport. Server-rendered parent layouts can compose this client
 * wrapper without themselves needing to be client components.
 */
export function ConditionalSiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isBarePath(pathname)) {
    // Bare mode: no header, no footer, no dock, no padding. The child is
    // responsible for filling the viewport (usually via position: fixed).
    return <>{children}</>;
  }

  return (
    <ToolbarDockProvider>
      <div className="flex min-h-screen flex-col bg-bg-deep pt-16 text-text-primary">
        <SiteHeader />
        <main className="flex-1 pb-24">{children}</main>
        <ConditionalFooter />
        <TopNav />
      </div>
    </ToolbarDockProvider>
  );
}
