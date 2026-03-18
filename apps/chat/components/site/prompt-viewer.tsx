"use client";

import { useCallback, useState } from "react";
import type { PromptVariable } from "@/lib/content";

interface PromptViewerProps {
  content: string;
  variables?: PromptVariable[];
}

export function PromptViewer({ content, variables }: PromptViewerProps) {
  const [copied, setCopied] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of variables ?? []) {
      initial[v.name] = v.default ?? "";
    }
    return initial;
  });

  const resolvedContent = variables?.length
    ? variables.reduce(
        (text, v) =>
          text.replaceAll(`{{${v.name}}}`, values[v.name] || `{{${v.name}}}`),
        content,
      )
    : content;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(resolvedContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [resolvedContent]);

  return (
    <div className="space-y-6">
      {variables?.length ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Variables
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {variables.map((v) => (
              <label key={v.name} className="block">
                <span className="mb-1 block text-xs text-text-secondary">
                  <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-ai-blue">
                    {`{{${v.name}}}`}
                  </code>{" "}
                  <span className="text-text-muted">{v.description}</span>
                </span>
                <input
                  type="text"
                  value={values[v.name] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [v.name]: e.target.value,
                    }))
                  }
                  placeholder={v.default ?? ""}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm text-text-primary placeholder:text-zinc-600 focus:border-ai-blue focus:outline-none focus:ring-1 focus:ring-ai-blue/30"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-3 top-3 z-10 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-ai-blue hover:text-ai-blue"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-6 pr-20 font-mono text-sm leading-relaxed text-text-secondary">
          <code>{resolvedContent}</code>
        </pre>
      </div>
    </div>
  );
}
