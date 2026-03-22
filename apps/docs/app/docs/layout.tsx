import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: "BroomVA",
        url: "/docs",
      }}
      links={[
        { text: "Platform", url: "https://broomva.tech", external: true },
        { text: "Chat", url: "https://broomva.tech/chat", external: true },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
