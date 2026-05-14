"use client";

import ReactMarkdown from "react-markdown";
import { FrontmatterCard } from "./FrontmatterCard";
import { useFile } from "./useFile";

interface Props {
  path: string;
}

/**
 * FileViewer — center-stage markdown render for one file. Reads from the
 * scene via `useFile`. Renders FrontmatterCard chip-row above the body.
 *
 * Markdown styling: Arcan Glass typography. We use prose-invert utility
 * classes from Tailwind for the body. Heading anchors are added by
 * react-markdown's default behavior; the Outline component picks them up.
 */
export function FileViewer({ path }: Props) {
  const file = useFile(path);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6 font-mono text-[12px] opacity-50">
        {path
          ? `No write event yet for ${path}.`
          : "Select a file in the left rail to open it."}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <FrontmatterCard frontmatter={file.frontmatter} path={file.path} />
      <article className="prose prose-invert prose-sm max-w-[72ch] font-mono [&_h1]:font-mono [&_h1]:text-[18px] [&_h2]:font-mono [&_h2]:text-[14px] [&_h3]:font-mono [&_h3]:text-[12px] [&_p]:text-[12px] [&_p]:leading-[1.65] [&_li]:text-[12px] [&_code]:text-[11px]">
        <ReactMarkdown>{file.content}</ReactMarkdown>
      </article>
    </div>
  );
}
