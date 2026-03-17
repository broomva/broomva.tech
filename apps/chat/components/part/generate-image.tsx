"use client";

import { useState } from "react";
import { ImageActions, ImageModal } from "@/components/image-modal";
import type { ChatMessage } from "@/lib/ai/types";

export type GenerateImageTool = Extract<
  ChatMessage["parts"][number],
  { type: "tool-generateImage" }
>;

export function GenerateImage({ tool }: { tool: GenerateImageTool }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (tool.state === "input-available") {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 rounded-lg border p-8">
        <div className="h-64 w-full animate-pulse rounded-lg bg-muted-foreground/20" />
        <div className="text-muted-foreground">
          Generating image: &quot;{tool.input.prompt}&quot;
        </div>
      </div>
    );
  }
  const output = tool.output;
  if (!output) {
    return null;
  }

  return (
    <>
      <div className="flex w-full flex-col gap-4 overflow-hidden rounded-lg border">
        <div className="group relative">
          <button
            className="w-full cursor-pointer text-left"
            onClick={() => setDialogOpen(true)}
            type="button"
          >
            {/* biome-ignore lint/performance/noImgElement: Next/Image isn't desired for dynamic external URLs here */}
            <img
              alt={output.prompt}
              className="h-auto w-full max-w-full"
              height={512}
              src={output.imageUrl}
              width={512}
            />
          </button>
          <ImageActions
            className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
            imageUrl={output.imageUrl}
          />
        </div>
        <div className="p-4 pt-0">
          <p className="text-muted-foreground text-sm">
            Generated from: &quot;{output.prompt}&quot;
          </p>
        </div>
      </div>

      <ImageModal
        imageName={output.prompt}
        imageUrl={output.imageUrl}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
