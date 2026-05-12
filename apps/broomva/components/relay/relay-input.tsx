"use client";

/**
 * RelayInput — simplified prompt input for relay sessions.
 *
 * No model selector, no file uploads, no ChatInputProvider dependency.
 * Just text input + send button. Posts to the relay input endpoint.
 */

import { Send, Terminal } from "lucide-react";
import { useCallback, useState } from "react";
import { useRelayContext } from "./relay-context";

export function RelayInput() {
  const { sendInput, ended } = useRelayContext();
  const [value, setValue] = useState("");

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    sendInput(text);
  }, [value, sendInput]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (ended) {
    return (
      <p className="text-center text-xs text-muted-foreground">Session ended</p>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
      <Terminal className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Send input to session..."
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={!value.trim()}
        className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        aria-label="Send"
      >
        <Send className="size-4" />
      </button>
    </div>
  );
}
