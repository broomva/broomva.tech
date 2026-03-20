"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CONSOLE_NAV } from "@/lib/console/constants";
import { cn } from "@/lib/utils";

export function ConsoleNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--ag-border-subtle)] bg-bg-dark">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-[var(--ag-border-subtle)] px-5 py-4">
        <div className="size-2 rounded-full bg-ai-blue shadow-glow-blue" />
        <span className="font-heading text-sm font-semibold tracking-wide text-text-primary">
          Life Console
        </span>
      </div>

      {/* Links */}
      <ul className="flex flex-1 flex-col gap-1 px-3 py-4">
        {CONSOLE_NAV.map((item) => {
          const isActive =
            item.href === "/console"
              ? pathname === "/console"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <li key={item.key}>
              <Link
                href={item.href as Route}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-bg-hover text-ai-blue"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="border-t border-[var(--ag-border-subtle)] px-5 py-3">
        <Link
          href="/"
          className="text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          Back to site
        </Link>
      </div>
    </nav>
  );
}
