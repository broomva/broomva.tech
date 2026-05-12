"use client";

import { ChevronDown, ExternalLink, Globe, TextIcon } from "lucide-react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@/lib/ai/types";

export type RetrieveUrlTool = Extract<
  ChatMessage["parts"][number],
  { type: "tool-retrieveUrl" }
>;

function LoadingState() {
  return (
    <div className="my-4 rounded-xl border border-neutral-200 bg-linear-to-b from-white to-neutral-50 p-4 dark:border-neutral-800 dark:from-neutral-900 dark:to-neutral-900/90">
      <div className="flex items-center gap-4">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 animate-pulse rounded-full bg-primary/10" />
          <Globe className="absolute inset-0 m-auto h-5 w-5 text-primary/70" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-4 w-36 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
          <div className="space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800/50" />
            <div className="h-3 w-2/3 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800/50" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ errorMessage }: { errorMessage: string | undefined }) {
  return (
    <div className="my-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500 dark:bg-red-950/50">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
          <Globe className="h-4 w-4 text-red-600 dark:text-red-300" />
        </div>
        <div>
          <div className="font-medium text-red-700 text-sm dark:text-red-300">
            Error retrieving content
          </div>
          <div className="mt-1 text-red-600/80 text-xs dark:text-red-400/80">
            {errorMessage}
          </div>
        </div>
      </div>
    </div>
  );
}

function getItemProperty<T>(
  item: unknown,
  property: string,
  defaultValue: T
): T {
  if (item && typeof item === "object" && property in item) {
    const value = (item as Record<string, unknown>)[property];
    return (value as T) ?? defaultValue;
  }
  return defaultValue;
}

function RetrievedContentHeader({ firstItem }: { firstItem: unknown }) {
  const url = getItemProperty(firstItem, "url", "");
  const title = getItemProperty(firstItem, "title", "Retrieved Content");
  const description = getItemProperty(
    firstItem,
    "description",
    "No description available"
  );
  const language = getItemProperty(firstItem, "language", "Unknown");

  return (
    <div className="p-4">
      <div className="flex items-start gap-4">
        <div className="relative h-10 w-10 shrink-0">
          <div className="absolute inset-0 rounded-lg bg-linear-to-br from-primary/10 to-transparent" />
          <Image
            alt=""
            className="absolute inset-0 m-auto"
            height={20}
            src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`}
            width={20}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="truncate font-semibold text-lg text-neutral-900 tracking-tight dark:text-neutral-100">
            {title}
          </h2>
          <p className="line-clamp-2 text-neutral-600 text-sm dark:text-neutral-400">
            {description}
          </p>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-xs">
              {language}
            </span>
            <a
              className="inline-flex items-center gap-1.5 text-neutral-500 text-xs transition-colors hover:text-primary"
              href={url || "#"}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-3 w-3" />
              View source
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function RetrievedContentDetails({ firstItem }: { firstItem: unknown }) {
  const content = getItemProperty(firstItem, "content", "No content available");

  return (
    <div className="border-neutral-200 border-t dark:border-neutral-800">
      <details className="group">
        <summary className="flex w-full cursor-pointer items-center justify-between px-4 py-2 text-neutral-700 text-sm transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/50">
          <div className="flex items-center gap-2">
            <TextIcon className="h-4 w-4 text-neutral-400" />
            <span>View content</span>
          </div>
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="max-h-[50vh] overflow-y-auto bg-neutral-50/50 p-4 dark:bg-neutral-800/30">
          <div className="prose prose-neutral dark:prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      </details>
    </div>
  );
}

function getFirstItem(result: unknown): unknown {
  if (
    result &&
    typeof result === "object" &&
    "results" in result &&
    Array.isArray(result.results)
  ) {
    return result.results[0];
  }
}

function getErrorMessage(result: unknown, firstItem: unknown): string | null {
  const topLevelError =
    result && typeof result === "object" && "error" in result
      ? (result.error as string)
      : undefined;
  const firstItemError =
    firstItem && typeof firstItem === "object" && "error" in firstItem
      ? (firstItem.error as string)
      : undefined;

  return topLevelError ?? firstItemError ?? null;
}

export function RetrieveUrl({ tool }: { tool: RetrieveUrlTool }) {
  if (tool.state === "input-available") {
    return <LoadingState />;
  }

  const { output: result } = tool;
  const firstItem = getFirstItem(result);
  const errorMessage = getErrorMessage(result, firstItem);

  if (errorMessage) {
    return <ErrorState errorMessage={errorMessage} />;
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-neutral-200 bg-linear-to-b from-white to-neutral-50 dark:border-neutral-800 dark:from-neutral-900 dark:to-neutral-900/90">
      <RetrievedContentHeader firstItem={firstItem} />
      <RetrievedContentDetails firstItem={firstItem} />
    </div>
  );
}
