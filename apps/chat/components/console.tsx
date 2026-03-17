import { Loader2, Terminal, X } from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export type ConsoleOutputContent = {
  type: "text" | "image";
  value: string;
};

export type ConsoleOutput = {
  id: string;
  status: "in_progress" | "loading_packages" | "completed" | "failed";
  contents: ConsoleOutputContent[];
};

function getConsoleStatusText(consoleOutput: ConsoleOutput): string | null {
  if (consoleOutput.status === "in_progress") {
    return "Initializing...";
  }
  if (consoleOutput.status === "loading_packages") {
    const textContents = consoleOutput.contents
      .filter((content) => content.type === "text")
      .map((content) => content.value)
      .join("");
    return textContents;
  }
  return null;
}

export function Console({
  consoleOutputs,
  setConsoleOutputs,
  className,
}: {
  consoleOutputs: ConsoleOutput[];
  setConsoleOutputs: Dispatch<SetStateAction<ConsoleOutput[]>>;
  className?: string;
}) {
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!isArtifactVisible) {
      setConsoleOutputs([]);
    }
  }, [isArtifactVisible, setConsoleOutputs]);

  return consoleOutputs.length > 0 ? (
    <div className={cn("flex w-full flex-col overflow-hidden", className)}>
      <div className="flex h-full w-full flex-col overflow-x-hidden overflow-y-scroll border-zinc-200 border-t bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="sticky top-0 z-50 flex h-fit w-full flex-row items-center justify-between border-zinc-200 border-b bg-muted px-2 py-1 dark:border-zinc-700">
          <div className="flex flex-row items-center gap-3 pl-2 text-sm text-zinc-800 dark:text-zinc-50">
            <div className="text-muted-foreground">
              <Terminal size={16} />
            </div>
            <div>Console</div>
          </div>
          <Button
            className="size-fit p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            onClick={() => setConsoleOutputs([])}
            size="icon"
            variant="ghost"
          >
            <X size={16} />
          </Button>
        </div>

        <div>
          {consoleOutputs.map((consoleOutput, index) => (
            <div
              className="flex flex-row border-zinc-200 border-b bg-zinc-50 px-4 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
              key={consoleOutput.id}
            >
              <div
                className={cn("w-12 shrink-0", {
                  "text-muted-foreground": [
                    "in_progress",
                    "loading_packages",
                  ].includes(consoleOutput.status),
                  "text-emerald-500": consoleOutput.status === "completed",
                  "text-red-400": consoleOutput.status === "failed",
                })}
              >
                [{index + 1}]
              </div>
              {["in_progress", "loading_packages"].includes(
                consoleOutput.status
              ) ? (
                <div className="flex flex-row gap-2">
                  <div className="mt-0.5 mb-auto size-fit animate-spin self-center">
                    <Loader2 size={16} />
                  </div>
                  <div className="text-muted-foreground">
                    {getConsoleStatusText(consoleOutput)}
                  </div>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-2 overflow-x-scroll text-zinc-900 dark:text-zinc-50">
                  {consoleOutput.contents.map((content, contentIndex) =>
                    content.type === "image" ? (
                      <picture key={`${consoleOutput.id}-${contentIndex}`}>
                        <img
                          alt="output"
                          className="w-full max-w-(--breakpoint-toast-mobile) rounded-md"
                          height="auto"
                          src={content.value}
                          width="100%"
                        />
                      </picture>
                    ) : (
                      <div
                        className="break-word-wrap w-full whitespace-pre-line"
                        key={`${consoleOutput.id}-${contentIndex}`}
                      >
                        {content.value}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  ) : null;
}
