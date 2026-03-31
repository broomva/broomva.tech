/**
 * Relay Message Adapter — DaemonMessage -> ChatMessage
 *
 * Converts relay SSE events into ChatMessage objects compatible with the
 * CustomStoreProvider (Zustand) used by the chat system. This is the single
 * translation layer that enables the same Messages -> AssistantMessage ->
 * MessageParts rendering pipeline to work for both cloud chat and relay.
 *
 * The `RelayTurnAccumulator` class accumulates streaming events into rich
 * messages, avoiding the one-message-per-event pattern of the old stateless
 * adapter. Consecutive assistant_message and tool_event events are merged
 * into a single ChatMessage, and the caller receives `{ message, isNew }`
 * to decide whether to push a new message or update an existing one.
 */

import type { AppModelId } from "@/lib/ai/app-model-id";
import type { ChatMessage, MessageMetadata } from "@/lib/ai/types";
import type { DaemonMessage } from "@/lib/relay/protocol";
import { generateUUID } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMetadata(
  parentMessageId: string | null,
  model?: string | null,
): MessageMetadata {
  return {
    createdAt: new Date(),
    parentMessageId,
    selectedModel: (model ?? "relay") as AppModelId,
    activeStreamId: null,
  };
}

/**
 * Build a tool summary string from tool input, matching the patterns used
 * in the existing relay session page (file paths, commands, patterns).
 */
function getToolSummary(
  toolName: string,
  input: Record<string, unknown>,
): string {
  switch (toolName) {
    case "Edit":
    case "Write":
    case "Read":
      return String(input.file_path ?? input.path ?? "");
    case "Bash":
      return String(input.command ?? "").slice(0, 120);
    case "Glob":
    case "Grep":
      return String(input.pattern ?? "");
    default:
      return "";
  }
}

/**
 * Format a tool event as markdown text for display in the chat feed.
 */
function formatToolText(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const summary = getToolSummary(toolName, input);
  return summary
    ? `**${toolName}** \`${summary}\``
    : `**${toolName}**`;
}

// ── Accumulator result ───────────────────────────────────────────────────

export interface AccumulatorResult {
  message: ChatMessage;
  isNew: boolean;
}

// ── RelayTurnAccumulator ─────────────────────────────────────────────────

/**
 * Stateful accumulator that merges streaming DaemonMessage events into
 * ChatMessage objects. Instead of creating one message per event, it
 * accumulates consecutive assistant text and tool events into a single
 * assistant turn message. The caller uses `isNew` to decide whether to
 * push or update.
 *
 * Lifecycle:
 *   1. First content event -> creates a new message (isNew: true)
 *   2. Subsequent content events -> updates the same message (isNew: false)
 *   3. Boundary events (session_ended, error, session_created, approval_request)
 *      -> flush current, create standalone message
 *   4. flush() -> resets the accumulator for the next turn
 */
export class RelayTurnAccumulator {
  private currentMessage: ChatMessage | null = null;
  private textBuffer: string = "";
  private toolParts: string[] = [];
  private isStreaming = false;
  private model: string | null;
  private parentMessageId: string | null;

  constructor(model?: string | null) {
    this.model = model ?? null;
    this.parentMessageId = null;
  }

  /** Update the parent message ID for chaining. */
  setParentMessageId(id: string | null): void {
    this.parentMessageId = id;
  }

  /** Get the current message ID (for parent chaining after push). */
  getCurrentMessageId(): string | null {
    return this.currentMessage?.id ?? null;
  }

  /**
   * Process a single DaemonMessage event.
   *
   * Returns `{ message, isNew }` when the store should be updated:
   *   - isNew: true  -> caller should pushMessage (new entry in feed)
   *   - isNew: false -> caller should replaceMessageById (update existing)
   *
   * Returns `null` when the event should not produce a store update
   * (e.g. workspace_status, pong, node_info, output).
   */
  processEvent(event: DaemonMessage): AccumulatorResult | null {
    switch (event.type) {
      // ── Content events (accumulate into the current turn) ──────────

      case "assistant_message": {
        // If we are already streaming (have a current message), append.
        // Otherwise, create a new message.
        if (this.isStreaming && this.currentMessage) {
          // Append text to the existing buffer
          this.textBuffer += `${this.textBuffer ? "\n\n" : ""}${event.text}`;
          this.currentMessage = this.rebuildMessage();
          return { message: this.currentMessage, isNew: false };
        }

        // First content in this turn — create new message
        this.textBuffer = event.text;
        this.toolParts = [];
        this.isStreaming = true;
        this.currentMessage = this.buildNewMessage();
        return { message: this.currentMessage, isNew: true };
      }

      case "tool_event": {
        const toolText = formatToolText(event.toolName, event.input);

        if (this.isStreaming && this.currentMessage) {
          // Append tool as an additional text section
          this.toolParts.push(toolText);
          this.currentMessage = this.rebuildMessage();
          return { message: this.currentMessage, isNew: false };
        }

        // First content in this turn is a tool event
        this.textBuffer = "";
        this.toolParts = [toolText];
        this.isStreaming = true;
        this.currentMessage = this.buildNewMessage();
        return { message: this.currentMessage, isNew: true };
      }

      // ── Raw PTY output (skip — noise in chat UI) ──────────────────

      case "output":
        return null;

      // ── Boundary events (flush current turn, create standalone) ────

      case "approval_request": {
        // Flush any in-progress turn first, then create standalone message
        const results: AccumulatorResult[] = [];
        const flushed = this.flushCurrent();
        if (flushed) results.push(flushed);

        const msg = this.buildStandaloneMessage(
          `> **Approval requested:** ${event.capability}\n> ${event.context}`,
        );
        return { message: msg, isNew: true };
      }

      case "session_ended": {
        this.flushCurrent();
        const msg = this.buildStandaloneMessage(
          `---\n*Session ended — ${event.reason}*`,
        );
        return { message: msg, isNew: true };
      }

      case "session_created": {
        this.flushCurrent();
        const msg = this.buildStandaloneMessage(
          `*Session started: ${event.session.name}*`,
        );
        return { message: msg, isNew: true };
      }

      case "error": {
        this.flushCurrent();
        const msg = this.buildStandaloneMessage(
          `> **Error** [${event.code}]: ${event.message}`,
        );
        return { message: msg, isNew: true };
      }

      // ── Non-feed events ───────────────────────────────────────────

      case "workspace_status":
      case "pong":
      case "node_info":
      case "session_list":
      case "dir_listing":
        return null;

      default:
        return null;
    }
  }

  /**
   * Flush the current in-progress message and reset state.
   * Returns the final message if one was in progress, null otherwise.
   * This should be called when a turn boundary is reached (e.g. before
   * creating a standalone message, or on session_ended / turn_result).
   */
  flush(): ChatMessage | null {
    const result = this.flushCurrent();
    return result?.message ?? null;
  }

  /**
   * Reset the accumulator entirely (e.g. on reconnect).
   */
  reset(): void {
    this.currentMessage = null;
    this.textBuffer = "";
    this.toolParts = [];
    this.isStreaming = false;
    this.parentMessageId = null;
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Flush the current turn and return its final message for a store update.
   * After flushing, the accumulator is ready for a new turn but the
   * parentMessageId chain is preserved.
   */
  private flushCurrent(): AccumulatorResult | null {
    if (!this.isStreaming || !this.currentMessage) {
      return null;
    }
    // The current message is already up-to-date from the last processEvent.
    // We just need to reset state.
    const msg = this.currentMessage;
    this.parentMessageId = msg.id;
    this.currentMessage = null;
    this.textBuffer = "";
    this.toolParts = [];
    this.isStreaming = false;
    // Return as an update (not new) — the message was already pushed earlier.
    return { message: msg, isNew: false };
  }

  /** Build the combined text content from text buffer + tool parts. */
  private buildCombinedText(): string {
    const parts: string[] = [];
    if (this.textBuffer) parts.push(this.textBuffer);
    for (const tp of this.toolParts) {
      parts.push(tp);
    }
    return parts.join("\n\n");
  }

  /** Create a brand-new ChatMessage for the start of a turn. */
  private buildNewMessage(): ChatMessage {
    const id = generateUUID();
    return {
      id,
      role: "assistant",
      parts: [{ type: "text", text: this.buildCombinedText() }],
      metadata: makeMetadata(this.parentMessageId, this.model),
    };
  }

  /** Rebuild the current message with updated text (preserves id). */
  private rebuildMessage(): ChatMessage {
    if (!this.currentMessage) {
      return this.buildNewMessage();
    }
    return {
      ...this.currentMessage,
      parts: [{ type: "text", text: this.buildCombinedText() }],
    };
  }

  /** Create a standalone message that is not part of an accumulated turn. */
  private buildStandaloneMessage(text: string): ChatMessage {
    const id = generateUUID();
    const msg: ChatMessage = {
      id,
      role: "assistant",
      parts: [{ type: "text", text }],
      metadata: makeMetadata(this.parentMessageId, this.model),
    };
    this.parentMessageId = id;
    return msg;
  }
}

// ── Legacy stateless API (kept for compatibility) ────────────────────────

/**
 * Convert a single DaemonMessage into a ChatMessage.
 * Returns null for events that should not appear in the message feed
 * (e.g. workspace_status, pong, node_info).
 *
 * @deprecated Use RelayTurnAccumulator for streaming sessions. This
 * stateless function is retained for one-off conversions and tests.
 */
export function daemonEventToChatMessage(
  event: DaemonMessage,
  opts: {
    parentMessageId: string | null;
    model?: string | null;
  } = { parentMessageId: null },
): ChatMessage | null {
  const id = generateUUID();
  const meta = makeMetadata(opts.parentMessageId, opts.model);

  switch (event.type) {
    case "assistant_message":
      return {
        id,
        role: "assistant",
        parts: [{ type: "text", text: event.text }],
        metadata: meta,
      };

    case "tool_event": {
      const toolText = formatToolText(event.toolName, event.input);
      return {
        id,
        role: "assistant",
        parts: [{ type: "text", text: toolText }],
        metadata: meta,
      };
    }

    case "output":
      return null;

    case "approval_request":
      return {
        id,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `> **Approval requested:** ${event.capability}\n> ${event.context}`,
          },
        ],
        metadata: meta,
      };

    case "session_ended":
      return {
        id,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `---\n*Session ended — ${event.reason}*`,
          },
        ],
        metadata: meta,
      };

    case "session_created":
      return {
        id,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `*Session started: ${event.session.name}*`,
          },
        ],
        metadata: meta,
      };

    case "error":
      return {
        id,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `> **Error** [${event.code}]: ${event.message}`,
          },
        ],
        metadata: meta,
      };

    case "workspace_status":
    case "pong":
    case "node_info":
    case "session_list":
      return null;

    default:
      return null;
  }
}

// ── Batch grouping ────────────────────────────────────────────────────────

/**
 * Groups consecutive DaemonMessage events into ChatMessage objects.
 *
 * Consecutive assistant_message + tool_event + output events are merged into
 * a single ChatMessage with multiple parts (mimicking how the chat system
 * groups assistant turns). A new message is started when:
 *   - A session_ended or session_created event appears
 *   - An error event appears
 *   - An approval_request appears
 *
 * This function is useful for replaying a buffer of events on reconnect.
 */
export function groupRelayEventsIntoMessages(
  events: DaemonMessage[],
  model?: string | null,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let currentParts: ChatMessage["parts"] = [];
  let lastMessageId: string | null = null;

  function flushCurrent() {
    if (currentParts.length === 0) return;
    const id = generateUUID();
    messages.push({
      id,
      role: "assistant",
      parts: [...currentParts],
      metadata: makeMetadata(lastMessageId, model),
    });
    lastMessageId = id;
    currentParts = [];
  }

  for (const event of events) {
    switch (event.type) {
      case "assistant_message":
        currentParts.push({ type: "text", text: event.text });
        break;

      case "tool_event": {
        const toolText = formatToolText(event.toolName, event.input);
        currentParts.push({ type: "text", text: toolText });
        break;
      }

      case "output":
        currentParts.push({
          type: "text",
          text: `\`\`\`\n${event.data}\`\`\``,
        });
        break;

      // These event types flush the current group and create standalone messages
      case "approval_request":
      case "session_ended":
      case "session_created":
      case "error": {
        flushCurrent();
        const msg = daemonEventToChatMessage(event, {
          parentMessageId: lastMessageId,
          model,
        });
        if (msg) {
          messages.push(msg);
          lastMessageId = msg.id;
        }
        break;
      }

      // Skip non-feed events
      default:
        break;
    }
  }

  flushCurrent();
  return messages;
}
