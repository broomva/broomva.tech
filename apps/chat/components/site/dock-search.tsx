"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  X,
  FileText,
  FolderOpen,
  Sparkles,
  NotebookPen,
  Layers,
  MessageCircle,
  Home,
  ArrowRight,
  Globe,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useSearchIndex, type SearchEntry } from "@/hooks/use-search-index";

const KIND_META: Record<
  string,
  { icon: typeof FileText; color: string; label: string }
> = {
  writing: { icon: NotebookPen, color: "text-blue-400", label: "Writing" },
  notes: { icon: FileText, color: "text-emerald-400", label: "Note" },
  projects: { icon: FolderOpen, color: "text-amber-400", label: "Project" },
  prompts: { icon: Sparkles, color: "text-purple-400", label: "Prompt" },
  skill: { icon: Layers, color: "text-cyan-400", label: "Skill" },
  repo: { icon: Globe, color: "text-orange-400", label: "Repo" },
  page: { icon: Home, color: "text-zinc-400", label: "Page" },
};

const QUICK_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/writing", label: "Writing", icon: NotebookPen },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/skills", label: "Skills", icon: Layers },
  { href: "/prompts", label: "Prompts", icon: Sparkles },
  { href: "/chat", label: "Chat", icon: MessageCircle },
];

export function DockSearch() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { search, isReady } = useSearchIndex();

  const results: SearchEntry[] = isExpanded && query.length > 0 ? search(query) : [];

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleCollapse = useCallback(() => {
    setIsExpanded(false);
    setQuery("");
    setSelectedIndex(-1);
  }, []);

  const navigateTo = useCallback(
    (href: string) => {
      handleCollapse();
      if (href.startsWith("http")) {
        window.open(href, "_blank", "noopener");
      } else {
        router.push(href as Route);
      }
    },
    [handleCollapse, router],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = query ? results : QUICK_LINKS;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item) navigateTo("href" in item ? item.href : "");
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCollapse();
      }
    },
    [query, results, selectedIndex, navigateTo, handleCollapse],
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insidePanel = panelRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insidePanel && !insideDropdown) {
        handleCollapse();
      }
    }
    if (isExpanded) {
      document.addEventListener("mousedown", onClickOutside);
    }
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isExpanded, handleCollapse]);

  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isExpanded) handleCollapse();
        else handleExpand();
      }
    }
    document.addEventListener("keydown", onGlobalKey);
    return () => document.removeEventListener("keydown", onGlobalKey);
  }, [isExpanded, handleCollapse, handleExpand]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  const showResults = query.length > 0;
  const showQuickLinks = isExpanded && !showResults;
  const showDropdown = showQuickLinks || showResults;

  const [dropdownPos, setDropdownPos] = useState<{
    bottom: number;
    right: number;
  } | null>(null);

  const updatePosition = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) return;
    setDropdownPos({
      bottom: window.innerHeight - rect.top + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    if (!showDropdown) {
      setDropdownPos(null);
      return;
    }

    updatePosition();

    const panel = panelRef.current;
    let ro: ResizeObserver | undefined;
    if (panel) {
      ro = new ResizeObserver(updatePosition);
      ro.observe(panel);
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showDropdown, updatePosition]);

  const dropdownContent =
    showDropdown &&
    dropdownPos &&
    createPortal(
      <AnimatePresence>
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-auto fixed z-50 w-80 max-w-[calc(100vw-1rem)] max-h-80 overflow-y-auto rounded-xl border border-zinc-700/60 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-xl"
          style={{
            bottom: dropdownPos.bottom,
            right: Math.max(8, dropdownPos.right),
          }}
        >
          {showQuickLinks && (
            <>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Quick links
              </div>
              {QUICK_LINKS.map((link, i) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => navigateTo(link.href)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      selectedIndex === i
                        ? "bg-zinc-700/60 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800/80"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="text-sm">{link.label}</span>
                    <ArrowRight className="ml-auto h-3 w-3 text-zinc-600" />
                  </button>
                );
              })}
              <div className="mt-1 border-t border-zinc-800 px-2 py-1.5">
                <span className="text-[10px] text-zinc-600">
                  ⌘K to toggle &middot; ESC to close
                </span>
              </div>
            </>
          )}

          {showResults && (
            <>
              {!isReady && (
                <div className="px-2 py-3 text-center text-xs text-zinc-500">
                  Loading index...
                </div>
              )}
              {isReady && results.length === 0 && query.length > 0 && (
                <div className="px-2 py-3 text-center text-xs text-zinc-500">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}
              {results.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    {results.length} result{results.length !== 1 && "s"}
                  </div>
                  {results.map((result, i) => {
                    const meta =
                      KIND_META[result.kind] ?? KIND_META.page;
                    const Icon = meta.icon;
                    return (
                      <motion.button
                        key={result.id}
                        type="button"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => navigateTo(result.href)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                          selectedIndex === i
                            ? "bg-zinc-700/60 text-zinc-100"
                            : "text-zinc-300 hover:bg-zinc-800/80"
                        }`}
                      >
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${meta.color}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{result.title}</div>
                          {result.summary && (
                            <div className="truncate text-[11px] text-zinc-500">
                              {result.summary}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {meta.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </>
              )}
              <div className="mt-1 border-t border-zinc-800 px-2 py-1.5">
                <span className="text-[10px] text-zinc-600">
                  ↑↓ navigate &middot; ↵ open &middot; ESC close
                </span>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>,
      document.body,
    );

  return (
    <div ref={panelRef} className="relative flex items-center">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.button
            key="search-icon"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleExpand}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-zinc-700/50"
            aria-label="Search site"
          >
            <Search className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-text-primary" />
          </motion.button>
        ) : (
          <motion.div
            key="search-expanded"
            initial={{ width: 32, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 32, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative"
          >
            <div className="flex items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-800/90 backdrop-blur-md">
              <div className="ml-3 shrink-0">
                <Search className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search..."
                className="h-8 flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />
              <motion.button
                type="button"
                onClick={handleCollapse}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="mr-1.5 flex h-5 w-5 items-center justify-center rounded-md hover:bg-zinc-700/50"
              >
                <X className="h-3 w-3 text-zinc-500" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {dropdownContent}
    </div>
  );
}
