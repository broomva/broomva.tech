"use client";

import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Favicon } from "../favicon";
import { getGoogleFaviconUrl } from "../get-google-favicon-url";
import { getUrlWithoutParams } from "../get-url-without-params";

export function ConnectorHeader({
  name,
  url,
  type,
  isCustom,
  statusText,
}: {
  name: string;
  url: string;
  type: string;
  isCustom: boolean;
  statusText?: string;
}) {
  const faviconUrl = type === "http" ? getGoogleFaviconUrl(url) : "";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {faviconUrl ? (
          <>
            <Favicon className="size-5 rounded-sm" url={faviconUrl} />
            <Globe className="hidden size-5 text-muted-foreground" />
          </>
        ) : (
          <Globe className="size-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="truncate font-medium text-sm">{name}</span>
          {isCustom ? (
            <Badge
              className="h-5 shrink-0 px-2 text-[10px]"
              variant="secondary"
            >
              CUSTOM
            </Badge>
          ) : (
            <Badge className="h-5 shrink-0 px-2 text-[10px]" variant="outline">
              Built-in
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-muted-foreground text-xs">
          {getUrlWithoutParams(url)}
        </p>
        {statusText ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {statusText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
