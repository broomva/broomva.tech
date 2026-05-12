"use client";

import { FileTextIcon, Loader2Icon, PaperclipIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { Attachment } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

function LoadingPreview() {
  return (
    <div className="flex size-full items-center justify-center">
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function ImagePreview({ name, url }: { name: string; url: string }) {
  return (
    <Image
      alt={name || "attachment"}
      className="object-cover"
      fill
      sizes="80px"
      src={url}
    />
  );
}

function FilePreview({ isPdf }: { isPdf: boolean }) {
  return (
    <div className="flex size-full items-center justify-center">
      {isPdf ? (
        <FileTextIcon className="size-5 text-red-500" />
      ) : (
        <PaperclipIcon className="size-5 text-muted-foreground" />
      )}
    </div>
  );
}

function AttachmentPreview({
  isUploading,
  isImage,
  isPdf,
  name,
  url,
}: {
  isUploading: boolean;
  isImage: boolean;
  isPdf: boolean;
  name: string;
  url: string;
}) {
  if (isUploading) {
    return <LoadingPreview />;
  }
  if (isImage) {
    return <ImagePreview name={name} url={url} />;
  }
  return <FilePreview isPdf={isPdf} />;
}

export function AttachmentCard({
  attachment,
  isUploading,
  onRemove,
  className,
}: {
  attachment: Attachment;
  isUploading: boolean;
  onRemove?: () => void;
  className?: string;
}) {
  const { name, url, contentType } = attachment;
  const isImage = Boolean(contentType?.startsWith("image/") && url);
  const isPdf = contentType === "application/pdf";

  return (
    <div
      className={cn(
        "group relative size-20 shrink-0 select-none overflow-hidden rounded-xl border border-border bg-muted/30 shadow-xs",
        isUploading && "opacity-60",
        className
      )}
      data-testid="input-attachment-preview"
    >
      <AttachmentPreview
        isImage={isImage}
        isPdf={isPdf}
        isUploading={isUploading}
        name={name}
        url={url}
      />

      {onRemove && !isUploading && (
        <Button
          aria-label="Remove attachment"
          className="absolute top-1 right-1 size-6 rounded-full border border-border bg-background/90 p-0 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 supports-[backdrop-filter]:bg-background/70 [&>svg]:size-3"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon />
          <span className="sr-only">Remove</span>
        </Button>
      )}
    </div>
  );
}
