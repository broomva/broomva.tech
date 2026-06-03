import type { ReactNode } from "react";
import { ToolbarDockProvider } from "@/components/site/toolbar-dock-context";
import { TopNav } from "@/components/site/top-nav";

/**
 * /maestro is a top-level route (outside the `(site)` group), so it doesn't get
 * the navigation dock that `ConditionalSiteChrome` mounts. This layout adds the
 * dock surgically (BRO-1372): the only context `TopNav` needs beyond root's
 * `AudioPlaybackProvider` is `ToolbarDockProvider`. No full site header/footer —
 * the console keeps its own chrome, just gains the dock.
 */
export default function MaestroLayout({ children }: { children: ReactNode }) {
  return (
    <ToolbarDockProvider>
      {children}
      <TopNav />
    </ToolbarDockProvider>
  );
}
