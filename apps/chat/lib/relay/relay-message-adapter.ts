/**
 * Relay Message Adapter — DaemonMessage → ChatMessage
 *
 * Converts relay SSE events into ChatMessage objects compatible with the
 * CustomStoreProvider (Zustand) used by the chat system. This is the single
 * translation layer that enables the same Messages → AssistantMessage →
 * MessageParts rendering pipeline to work for both cloud chat and relay.
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

// ── Single-event conversion ───────────────────────────────────────────────

/**
 * Convert a single DaemonMessage into a ChatMessage.
 * Returns null for events that should not appear in the message feed
 * (e.g. workspace_status, pong, node_info).
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
      const summary = getToolSummary(event.toolName, event.input);
      // Relay tools (Edit, Bash, Read, etc.) are Claude Code tools — they
      // don't exist in the chat app's ChatTools type. Render as formatted
      // markdown text so Streamdown displays them cleanly.
      const toolText = summary
        ? `**${event.toolName}** \`${summary}\``
        : `**${event.toolName}**`;
      return {
        id,
        role: "assistant",
        parts: [{ type: "text", text: toolText }],
        metadata: meta,
      };
    }

    case "output":
      // Wrap terminal output in a fenced code block so Streamdown renders it
      // with the dark terminal-like code block styling.
      return {
        id,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `\`\`\`\n${event.data}\`\`\``,
          },
        ],
        metadata: meta,
      };

    case "approval_request":
      // Approval requests are handled via RelayContext overlay, but we also
      // add a text message to the feed for history.
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

    // Events that don't go into the message feed
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
        const summary = getToolSummary(event.toolName, event.input);
        const toolText = summary
          ? `**${event.toolName}** \`${summary}\``
          : `**${event.toolName}**`;
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
