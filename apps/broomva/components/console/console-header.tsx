"use client";

import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CONSOLE_NAV } from "@/lib/console/constants";

function getBreadcrumbs(pathname: string) {
  const crumbs = [{ label: "Console", href: "/console" }];

  const match = CONSOLE_NAV.find(
    (item) => item.href !== "/console" && pathname.startsWith(item.href)
  );

  if (match) {
    crumbs.push({ label: match.label, href: match.href });
  }

  return crumbs;
}

export function ConsoleHeader() {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <header className="glass-nav flex h-14 items-center gap-2 px-6">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="size-3 text-text-muted" />}
          <Link
            href={crumb.href as Route}
            className={
              i === crumbs.length - 1
                ? "text-sm font-medium text-text-primary"
                : "text-sm text-text-secondary hover:text-text-primary"
            }
          >
            {crumb.label}
          </Link>
        </span>
      ))}
    </header>
  );
}
