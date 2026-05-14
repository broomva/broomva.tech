"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useSceneContextOptional } from "../session/SceneContext";

interface Props {
  path: string;
}

interface Backlink {
  id: string;
  /** The path of the file that links INTO `path` (i.e. the source). */
  source: string;
  label?: string;
}

/**
 * Backlinks — right-rail panel listing files that link to the current file.
 *
 * Walks the scene for `tool_call` intents where `name === "memory.link"`
 * and `args.target === path`. Emits one Backlink per matching source path.
 * Dedupes by source.
 *
 * Empty state: em-dash "—". No agents emit memory.link in v1, so this
 * panel is mostly a stub; it will light up once linking semantics ship.
 */
export function Backlinks({ path }: Props) {
  const { scene } = useSceneContextOptional();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const backlinks = useMemo<Backlink[]>(() => {
    const found = new Map<string, Backlink>();
    const walk = (n: {
      id: string;
      intent?: {
        type?: string;
        kind?: string;
        name?: string;
        tool?: string;
        args?: Record<string, unknown>;
      };
      children?: unknown[];
    }) => {
      const discriminator = n.intent?.type ?? n.intent?.kind;
      if (discriminator === "tool_call") {
        const name = n.intent?.name ?? n.intent?.tool ?? "";
        if (name === "memory.link") {
          const args = n.intent?.args ?? {};
          const target = typeof args.target === "string" ? args.target : "";
          const source = typeof args.source === "string" ? args.source : "";
          const label = typeof args.label === "string" ? args.label : undefined;
          if (target === path && source && !found.has(source)) {
            found.set(source, { id: n.id, source, label });
          }
        }
      }
      for (const c of (n.children ?? []) as Array<typeof n>) walk(c);
    };
    const root = (scene as unknown as { root?: unknown }).root;
    if (root) walk(root as never);
    return Array.from(found.values());
  }, [scene, path]);

  const navigate = useCallback(
    (target: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("file", target);
      router.push(`${pathname}?${next.toString()}` as Route);
    },
    [params, pathname, router],
  );

  if (backlinks.length === 0) {
    return <div className="px-1 py-2 font-mono text-[11px] opacity-60">—</div>;
  }

  return (
    <ul className="flex flex-col gap-0.5 font-mono text-[11px]">
      {backlinks.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => navigate(b.source)}
            className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left opacity-75 transition-colors hover:bg-[color:var(--ag-bg-hover)] hover:opacity-100"
          >
            <span aria-hidden style={{ color: "var(--ag-ai-blue)" }}>
              ◆
            </span>
            <span className="truncate">{b.label ?? b.source}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
