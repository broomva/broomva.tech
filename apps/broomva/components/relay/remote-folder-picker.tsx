"use client";

/**
 * RemoteFolderPicker — browse the remote relay node's filesystem.
 *
 * Fetches directory listings via GET /api/relay/nodes/{nodeId}/fs?path=...
 * and lets the user navigate folders to select a working directory.
 */

import {
  ChevronRight,
  Folder,
  File,
  Home,
  Loader2,
  ArrowUp,
  RefreshCw,
  FolderSearch,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DirEntry } from "@/lib/relay/protocol";

interface RemoteFolderPickerProps {
  /** The selected relay node ID — required to query the filesystem. */
  nodeId: string;
  /** Current working directory value. */
  value: string;
  /** Called when the user selects or types a directory path. */
  onChange: (path: string) => void;
  /** Whether the picker is disabled (e.g. no node selected). */
  disabled?: boolean;
}

interface FetchState {
  loading: boolean;
  error: string | null;
  path: string;
  entries: DirEntry[];
}

export function RemoteFolderPicker({
  nodeId,
  value,
  onChange,
  disabled = false,
}: RemoteFolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FetchState>({
    loading: false,
    error: null,
    path: "",
    entries: [],
  });

  const fetchDirectory = useCallback(
    async (path: string) => {
      if (!nodeId) return;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const res = await fetch(
          `/api/relay/nodes/${nodeId}/fs?path=${encodeURIComponent(path)}`,
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error || `Failed to list directory (${res.status})`,
          );
        }

        const data: { path: string; entries: DirEntry[] } = await res.json();

        setState({
          loading: false,
          error: null,
          path: data.path,
          entries: data.entries.sort((a, b) => {
            // Directories first, then alphabetical
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          }),
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to list directory",
        }));
      }
    },
    [nodeId],
  );

  // Fetch when the popover opens
  useEffect(() => {
    if (open && nodeId) {
      fetchDirectory(value || "~");
    }
  }, [open, nodeId, fetchDirectory, value]);

  const navigateTo = (dirPath: string) => {
    fetchDirectory(dirPath);
  };

  const navigateUp = () => {
    if (!state.path || state.path === "/") return;
    const parent = state.path.replace(/\/[^/]+\/?$/, "") || "/";
    navigateTo(parent);
  };

  const selectCurrent = () => {
    onChange(state.path);
    setOpen(false);
  };

  const enterFolder = (entry: DirEntry) => {
    if (!entry.isDir) return;
    const next =
      state.path === "/" ? `/${entry.name}` : `${state.path}/${entry.name}`;
    navigateTo(next);
  };

  // Breadcrumb segments from the current path
  const segments = state.path
    .split("/")
    .filter(Boolean)
    .map((seg, i, arr) => ({
      name: seg,
      path: `/${arr.slice(0, i + 1).join("/")}`,
    }));

  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium">Working Directory</span>

      <div className="flex items-center gap-1.5">
        {/* Editable text input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/home/user/project"
          disabled={disabled}
          className="flex h-9 w-full rounded-md border bg-transparent px-3 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />

        {/* Browse button with popover */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-2.5"
              disabled={disabled || !nodeId}
              type="button"
            >
              <FolderSearch className="size-3.5" />
              <span className="hidden sm:inline">Browse</span>
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="w-80 p-0"
            align="end"
            side="bottom"
          >
            {/* Header: breadcrumb + actions */}
            <div className="flex items-center gap-1 border-b px-2 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => navigateTo("~")}
                title="Home directory"
                type="button"
              >
                <Home className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={navigateUp}
                disabled={!state.path || state.path === "/"}
                title="Parent directory"
                type="button"
              >
                <ArrowUp className="size-3" />
              </Button>

              {/* Breadcrumb */}
              <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[10px] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => navigateTo("/")}
                  className="shrink-0 rounded px-1 py-0.5 hover:bg-accent hover:text-accent-foreground"
                >
                  /
                </button>
                {segments.map((seg) => (
                  <span key={seg.path} className="flex shrink-0 items-center">
                    <ChevronRight className="size-2.5 text-muted-foreground/50" />
                    <button
                      type="button"
                      onClick={() => navigateTo(seg.path)}
                      className="truncate rounded px-1 py-0.5 hover:bg-accent hover:text-accent-foreground"
                    >
                      {seg.name}
                    </button>
                  </span>
                ))}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => fetchDirectory(state.path || value || "~")}
                disabled={state.loading}
                title="Refresh"
                type="button"
              >
                <RefreshCw
                  className={`size-3 ${state.loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>

            {/* Content */}
            <ScrollArea className="h-64">
              {state.loading && (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading...
                </div>
              )}

              {state.error && !state.loading && (
                <div className="px-3 py-6 text-center text-xs text-destructive">
                  {state.error}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() =>
                      fetchDirectory(state.path || value || "~")
                    }
                    type="button"
                  >
                    Retry
                  </Button>
                </div>
              )}

              {!state.loading && !state.error && state.entries.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Empty directory
                </div>
              )}

              {!state.loading && !state.error && state.entries.length > 0 && (
                <div className="py-1">
                  {state.entries.map((entry) => (
                    <button
                      key={entry.name}
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        entry.isDir
                          ? "cursor-pointer hover:bg-accent"
                          : "cursor-default text-muted-foreground/60"
                      }`}
                      onClick={() => entry.isDir && enterFolder(entry)}
                      disabled={!entry.isDir}
                    >
                      {entry.isDir ? (
                        <Folder className="size-3.5 shrink-0 text-blue-500" />
                      ) : (
                        <File className="size-3.5 shrink-0 text-muted-foreground/40" />
                      )}
                      <span className="truncate">{entry.name}</span>
                      {entry.isDir && (
                        <ChevronRight className="ml-auto size-3 shrink-0 text-muted-foreground/50" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Footer: current path + select */}
            <div className="flex items-center justify-between border-t px-2.5 py-2">
              <span className="max-w-[180px] truncate text-[10px] text-muted-foreground">
                {state.path || "..."}
              </span>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={selectCurrent}
                disabled={!state.path || state.loading}
                type="button"
              >
                Select
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
