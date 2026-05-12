"use client";

import { cn } from "@/lib/utils";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

// Streamdown plugin packages can resolve a different `unified` type tree in CI.
const plugins = {
  code,
  mermaid,
  math,
} as unknown as NonNullable<ComponentProps<typeof Streamdown>["plugins"]>;

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      plugins={plugins}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children && prevProps.isAnimating === nextProps.isAnimating && prevProps.mode === nextProps.mode
);

Response.displayName = "Response";
