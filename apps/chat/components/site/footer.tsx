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
  { href: "https://x.com/broomva_", label: "X" },
  { href: "https://hi.broomva.tech", label: "Link hub" },
];

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 bg-black">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <Link
            href="/"
            className="font-display text-lg text-zinc-100 transition hover:text-emerald-300"
          >
            broomva.tech
          </Link>
          <p className="mt-2 text-xs text-zinc-500">
            Building autonomous software systems.
          </p>
        </div>
        <div className="flex gap-10">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Pages
            </p>
            <ul className="mt-3 space-y-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href as any}
                    className="text-sm text-zinc-400 transition hover:text-zinc-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Social
            </p>
            <ul className="mt-3 space-y-2">
              {socialLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-zinc-400 transition hover:text-zinc-100"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
