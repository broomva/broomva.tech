"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/start-here", label: "Start here" },
  { href: "/projects", label: "Projects" },
  { href: "/writing", label: "Writing" },
  { href: "/notes", label: "Notes" },
  { href: "/prompts", label: "Prompts" },
  { href: "/now", label: "Now" },
  { href: "/contact", label: "Contact" },
  { href: "/chat", label: "Chat" },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="glass-nav sticky top-0 z-40">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="font-display text-lg text-text-primary transition hover:text-ai-blue"
        >
          broomva.tech
        </Link>
        <nav>
          <ul className="flex flex-wrap items-center justify-end gap-2 text-xs sm:gap-3 sm:text-sm">
            {links.map((link) => {
              const active = isCurrent(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href as any}
                    className={[
                      "rounded-full px-3 py-1.5 transition",
                      active
                        ? "bg-ai-blue/15 text-ai-blue"
                        : "text-text-muted hover:text-text-primary",
                    ].join(" ")}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
