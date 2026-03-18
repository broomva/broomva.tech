import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ChatWelcomeHeading() {
  return (
    <div className="pointer-events-none text-center">
      <h1 className="font-normal text-2xl text-foreground sm:text-3xl">
        How can I help you today?
      </h1>
    </div>
  );
}

export function ChatWelcomeFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center",
        className
      )}
    >
      <div className="mx-auto w-full p-2 @[500px]:px-4 md:max-w-3xl">
        {children}
      </div>
    </div>
  );
}
