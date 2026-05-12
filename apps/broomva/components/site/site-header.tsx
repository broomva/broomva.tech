"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Home,
  Compass,
  FolderKanban,
  PenLine,
  StickyNote,
  CalendarClock,
  Mail,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ExpandableTabs, type TabItem } from "@/components/ui/expandable-tabs";

type NavLink = {
  href: string;
  title: string;
  icon: LucideIcon;
};

type SeparatorItem = {
  type: "separator";
};

type HeaderItem = NavLink | SeparatorItem;

const headerLinks: HeaderItem[] = [
  { href: "/", title: "Home", icon: Home },
  { href: "/start-here", title: "Start here", icon: Compass },
  { href: "/projects", title: "Projects", icon: FolderKanban },
  { href: "/writing", title: "Writing", icon: PenLine },
  { type: "separator" },
  { href: "/notes", title: "Notes", icon: StickyNote },
  { href: "/now", title: "Now", icon: CalendarClock },
  { href: "/contact", title: "Contact", icon: Mail },
];

function isNavLink(item: HeaderItem): item is NavLink {
  return !("type" in item);
}

export function SiteHeader() {
  const router = useRouter();

  const tabs: TabItem[] = headerLinks.map((link) => {
    if (!isNavLink(link)) {
      return { type: "separator" as const };
    }
    return {
      title: link.title,
      icon: link.icon,
    };
  });

  const navigableLinks = headerLinks.filter(isNavLink);

  const handleChange = (index: number | null) => {
    if (index === null) return;

    let separatorCount = 0;
    for (let i = 0; i <= index; i++) {
      const tab = headerLinks[i];
      if (tab && !isNavLink(tab)) {
        separatorCount++;
      }
    }
    const navIndex = index - separatorCount;

    const link = navigableLinks[navIndex];
    if (link) {
      router.push(link.href as Route);
    }
  };

  return (
    <header className="pointer-events-none fixed top-0 left-0 right-0 z-40 flex justify-center pt-4">
      <nav aria-label="Site navigation" className="pointer-events-auto">
        <ExpandableTabs
          tabs={tabs}
          activeColor="text-ai-blue"
          onChange={handleChange}
          className="border-zinc-800/50 bg-zinc-900/80 backdrop-blur-md shadow-lg"
        />
      </nav>
    </header>
  );
}
