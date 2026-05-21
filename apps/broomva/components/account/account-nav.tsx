"use client";

/**
 * Account-section sidebar nav. Mirrors the existing `SettingsNav` shape so
 * the visual language stays consistent across /settings/* and /account/*.
 *
 * BRO-1213 / M9-C.
 */

import { KeyRound, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export function AccountNav({
  orientation = "vertical",
}: {
  orientation?: "horizontal" | "vertical";
}) {
  const pathname = usePathname();

  const navItems = useMemo(
    () =>
      [
        { href: "/account" as const, label: "Overview", icon: LayoutDashboard },
        {
          href: "/account/security/passkey" as const,
          label: "Passkey",
          icon: KeyRound,
        },
      ] as const,
    [],
  );

  return (
    <nav
      aria-label="Account navigation"
      className={cn(
        "flex gap-1 sm:overflow-auto sm:pb-2",
        orientation === "vertical" ? "w-56 flex-col" : "flex-row",
      )}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          href === "/account"
            ? pathname === "/account"
            : pathname.startsWith(href);
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              isActive && "bg-muted text-foreground",
            )}
            href={href}
            key={href}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
