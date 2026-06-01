import type { Metadata } from "next";

/**
 * /d/* — gated viewer for agent-authored HTML documents (BRO-1293).
 * Private to the authenticated owner; never indexed.
 */
export const metadata: Metadata = {
  title: "Documents · broomva",
  robots: { index: false, follow: false },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">{children}</div>
  );
}
