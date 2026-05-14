"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface ApiResponse {
  sessions: string[];
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; sessions: string[] }
  | { kind: "error" };

const POLL_INTERVAL_MS = 10_000;

/**
 * SessionsList — renders the logged-in user's session ids as rows in
 * the LeftRail. Polls `GET /api/me/sessions` every 10s. Each row links
 * to `/workspace/<sid>`; the currently-active sid (matched by pathname)
 * is highlighted.
 *
 * Polling rather than SSE/WS because the registry mutation cadence is
 * low (humans clicking) and a 10s pull is cheaper than maintaining an
 * extra long-lived connection in v1.
 */
export function SessionsList() {
  const pathname = usePathname();
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/me/sessions", { cache: "no-store" });
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const data = (await res.json()) as ApiResponse;
        if (!cancelled) setState({ kind: "ready", sessions: data.sessions });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    };
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (state.kind === "loading") {
    return <div className="px-1 py-2 font-mono text-[11px] opacity-50">…</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">
        Sign in to see your sessions.
      </div>
    );
  }
  if (state.sessions.length === 0) {
    return (
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">
        No sessions yet.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {state.sessions.map((sid) => {
        const href = `/workspace/${sid}` as Route;
        const isActive = pathname === href;
        return (
          <li key={sid}>
            <Link
              href={href}
              className={`block w-full truncate rounded px-1.5 py-1 text-left font-mono text-[10.5px] transition-colors hover:bg-[color:var(--ag-bg-hover)] ${
                isActive
                  ? "bg-[color:var(--ag-bg-hover)] opacity-100"
                  : "opacity-75"
              }`}
            >
              <span className="opacity-60">▸ </span>
              <span>{sid.slice(0, 24)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
