"use client";

import { Headphones, Pause, Play, RotateCcw, RotateCw, Square } from "lucide-react";
import { useCallback } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudioPlayback } from "@/providers/audio-playback-provider";

const BTN =
  "inline-flex size-8 items-center justify-center rounded-full text-text-muted transition hover:text-ai-blue";

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function DockAudioControls() {
  const { track, state, currentTime, duration, pause, resume, stop, skip } =
    useAudioPlayback();

  const handleToggle = useCallback(() => {
    if (state === "playing") pause();
    else resume();
  }, [state, pause, resume]);

  if (!track || state === "idle") return null;

  return (
    <div className="flex items-center gap-1 md:gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={BTN} aria-label="Now playing">
            <Headphones className="size-3.5 text-ai-blue" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-48 text-center">
          {track.title}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => skip(-10)}
            aria-label="Back 10s"
            className={BTN}
          >
            <RotateCcw className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">-10s</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleToggle}
            aria-label={state === "playing" ? "Pause" : "Resume"}
            className={BTN}
          >
            {state === "playing" ? (
              <Pause className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {state === "playing" ? "Pause" : "Resume"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => skip(10)}
            aria-label="Forward 10s"
            className={BTN}
          >
            <RotateCw className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">+10s</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={stop}
            aria-label="Stop"
            className={BTN}
          >
            <Square className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Stop</TooltipContent>
      </Tooltip>

      <span className="ml-1 text-[11px] tabular-nums text-text-muted whitespace-nowrap md:ml-0.5 md:text-[10px]">
        {formatTime(currentTime)}/{formatTime(duration)}
      </span>
    </div>
  );
}
