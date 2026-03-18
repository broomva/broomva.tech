import type { Route } from "next";
import Link from "next/link";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/writing", label: "Writing" },
  { href: "/notes", label: "Notes" },
  { href: "/chat", label: "Chat" },
];

const socialLinks = [
  { href: "https://github.com/broomva", label: "GitHub" },
  { href: "https://www.linkedin.com/in/broomva/", label: "LinkedIn" },
  { href: "https://x.com/broomva_tech", label: "X" },
  { href: "/links", label: "Link hub" },
];

export function Footer() {
  return (
    <footer className="border-t border-[var(--ag-border-subtle)] bg-bg-dark">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <Link
            href="/"
            className="font-display text-lg text-text-primary transition hover:text-ai-blue"
          >
            broomva.tech
          </Link>
          <p className="mt-2 text-xs text-text-muted">
            Reliability engineering for complex systems.
          </p>
        </div>
        <div className="flex gap-10">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
              Pages
            </p>
            <ul className="mt-3 space-y-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href as Route}
                    className="text-sm text-text-secondary transition hover:text-text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
              Social
            </p>
            <ul className="mt-3 space-y-2">
              {socialLinks.map((link) => (
                <li key={link.href}>
                  {link.href.startsWith("/") ? (
                    <Link
                      href={link.href as Route}
                      className="text-sm text-text-secondary transition hover:text-text-primary"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-text-secondary transition hover:text-text-primary"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
