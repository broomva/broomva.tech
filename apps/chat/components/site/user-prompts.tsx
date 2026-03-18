"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { Session } from "@/lib/auth";

type UserPromptData = {
  id: string;
  title: string;
  content: string;
  summary?: string | null;
  category?: string | null;
  tags?: string[];
  visibility: string;
  updatedAt: string;
};

type EditState = {
  id?: string;
  title: string;
  content: string;
  summary: string;
  category: string;
  tags: string;
};

const emptyEdit: EditState = {
  title: "",
  content: "",
  summary: "",
  category: "",
  tags: "",
};

export function UserPrompts({ session }: { session: Session }) {
  const [prompts, setPrompts] = useState<UserPromptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/prompts/user");
    const data = await res.json();
    // Filter to only the user's own prompts
    setPrompts(
      data.filter((p: UserPromptData) => p.visibility === "private" || true)
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!editing || !editing.title.trim() || !editing.content.trim()) return;
    setSaving(true);
    const body = {
      title: editing.title,
      content: editing.content,
      summary: editing.summary || undefined,
      category: editing.category || undefined,
      tags: editing.tags
        ? editing.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    if (editing.id) {
      await fetch(`/api/prompts/user/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/prompts/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setSaving(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/prompts/user/${id}`, { method: "DELETE" });
    load();
  }

  function startEdit(prompt: UserPromptData) {
    setEditing({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      summary: prompt.summary ?? "",
      category: prompt.category ?? "",
      tags: prompt.tags?.join(", ") ?? "",
    });
  }

  return (
    <section className="mt-12">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-2xl text-text-primary">
          My Prompts
        </h2>
        <button
          type="button"
          onClick={() => setEditing(emptyEdit)}
          className="flex items-center gap-1.5 rounded-full bg-ai-blue/15 px-4 py-2 text-sm font-medium text-ai-blue transition hover:bg-ai-blue/25"
        >
          <Plus className="h-4 w-4" />
          New Prompt
        </button>
      </div>

      {/* Editor */}
      {editing && (
        <div className="glass-card mb-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              {editing.id ? "Edit Prompt" : "New Prompt"}
            </span>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded p-1 text-text-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              value={editing.title}
              onChange={(e) =>
                setEditing({ ...editing, title: e.target.value })
              }
              placeholder="Title"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-text-primary placeholder:text-zinc-600 focus:border-ai-blue focus:outline-none focus:ring-1 focus:ring-ai-blue/30"
            />
            <input
              value={editing.summary}
              onChange={(e) =>
                setEditing({ ...editing, summary: e.target.value })
              }
              placeholder="Summary (optional)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-text-primary placeholder:text-zinc-600 focus:border-ai-blue focus:outline-none focus:ring-1 focus:ring-ai-blue/30"
            />
            <textarea
              value={editing.content}
              onChange={(e) =>
                setEditing({ ...editing, content: e.target.value })
              }
              placeholder="Prompt content..."
              rows={8}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-zinc-600 focus:border-ai-blue focus:outline-none focus:ring-1 focus:ring-ai-blue/30"
            />
            <div className="flex gap-3">
              <input
                value={editing.category}
                onChange={(e) =>
                  setEditing({ ...editing, category: e.target.value })
                }
                placeholder="Category (optional)"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-text-primary placeholder:text-zinc-600 focus:border-ai-blue focus:outline-none focus:ring-1 focus:ring-ai-blue/30"
              />
              <input
                value={editing.tags}
                onChange={(e) =>
                  setEditing({ ...editing, tags: e.target.value })
                }
                placeholder="Tags (comma-separated)"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-text-primary placeholder:text-zinc-600 focus:border-ai-blue focus:outline-none focus:ring-1 focus:ring-ai-blue/30"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg px-4 py-2 text-sm text-text-muted transition hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={
                  saving ||
                  !editing.title.trim() ||
                  !editing.content.trim()
                }
                className="rounded-lg bg-ai-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-ai-blue/80 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="py-8 text-center text-sm text-text-muted">Loading...</p>
      ) : prompts.length === 0 && !editing ? (
        <div className="glass-card py-8 text-center">
          <p className="text-text-secondary">No prompts yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            Create one above, or ask the chat agent to save a prompt for you.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {prompts.map((prompt) => (
            <div key={prompt.id} className="glass-card group relative">
              <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => startEdit(prompt)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-1.5 text-text-muted transition hover:border-ai-blue hover:text-ai-blue"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(prompt.id)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-1.5 text-text-muted transition hover:border-red-500 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <h3 className="font-display text-xl text-text-primary pr-16">
                {prompt.title}
              </h3>
              {prompt.summary && (
                <p className="mt-1 text-sm text-text-secondary">
                  {prompt.summary}
                </p>
              )}
              <pre className="mt-3 max-h-24 overflow-hidden rounded-lg bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-text-secondary">
                <code>{prompt.content}</code>
              </pre>
              {prompt.tags && prompt.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {prompt.category && (
                    <span className="rounded-full bg-ai-blue/10 px-2.5 py-0.5 text-[11px] font-medium text-ai-blue">
                      {prompt.category}
                    </span>
                  )}
                  {prompt.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
