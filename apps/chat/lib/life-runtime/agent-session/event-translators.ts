/**
 * Pure translators between in-process formats and the canonical
 * `AgentEvent` typed union.
 *
 * Kept in a separate module (no `server-only`, no AI SDK import)
 * so the unit tests can load it without dragging the runtime
 * substrate (DB env vars, AI SDK provider construction, etc.).
 *
 * The home file is `in-process-client.ts`, which composes these
 * helpers with the streaming flow. Both files are governed by the
 * spec at:
 * `apps/chat/docs/superpowers/specs/2026-05-03-life-runtime-canonical.md`
 */

import type { DomainEvent } from "../types";
import type { AgentEvent } from "./types";

/**
 * Translate a `DomainEvent` (legacy in-process shape) into zero or
 * more canonical `AgentEvent`s. Some legacy events have no canonical
 * counterpart (`run_started`); those return `[]`.
 */
export function domainEventToCanonical(d: DomainEvent): AgentEvent[] {
  switch (d.type) {
    case "run_started": {
      return [];
    }
    case "fs_op": {
      const p = d.payload as {
        path?: string;
        op?: string;
        bytes?: number;
        content?: string;
      };
      const op: "read" | "write" = p.op === "read" ? "read" : "write";
      return [
        {
          kind: "fs_op",
          path: String(p.path ?? "/workspace/unknown"),
          op,
          bytes: p.bytes,
        },
      ];
    }
    case "nous_score": {
      const p = d.payload as { score?: number; band?: string; note?: string };
      return [
        {
          kind: "nous_score",
          dim: "overall",
          score: typeof p.score === "number" ? p.score : 0,
          rationale: p.note ?? p.band,
        },
      ];
    }
    case "autonomic_event": {
      const p = d.payload as { pillar?: string; text?: string };
      const pillar: "economic" | "cognitive" | "operational" =
        p.pillar === "economic" ||
        p.pillar === "cognitive" ||
        p.pillar === "operational"
          ? p.pillar
          : "operational";
      return [
        {
          kind: "autonomic",
          pillar,
          note: String(p.text ?? ""),
        },
      ];
    }
    case "kernel.dispatch.started":
    case "kernel.dispatch.completed":
      return [];
    case "done": {
      const p = d.payload as {
        costCents?: number;
        inputTokens?: number;
        outputTokens?: number;
        finishReason?: string;
      };
      return [
        {
          kind: "finish",
          reason: String(p.finishReason ?? "stop"),
          usage: {
            inputTokens: p.inputTokens,
            outputTokens: p.outputTokens,
            costCents: p.costCents,
          },
        },
      ];
    }
    case "error": {
      const p = d.payload as { code?: string; message?: string };
      return [
        {
          kind: "error",
          code: String(p.code ?? "in-process.error"),
          message: String(p.message ?? "unknown error"),
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Translate an AI-SDK stream part into canonical `AgentEvent`s.
 *
 * The interesting cases:
 *   - `text-delta` → token deltas
 *   - `reasoning` parts → thinking_start (caller pairs the matching
 *     thinking_end on the next non-reasoning yield)
 *   - `tool-call` → tool_call_pending
 *   - `tool-result` / `tool-error` → tool_result
 */
export function llmPartToCanonical(part: unknown): AgentEvent[] {
  if (!part || typeof part !== "object") return [];
  const p = part as { type?: string; [k: string]: unknown };
  switch (p.type) {
    case "text-start": {
      const messageId = String(p.id ?? "");
      if (!messageId) return [];
      return [{ kind: "text_start", messageId }];
    }
    case "text-delta": {
      const text =
        typeof p.text === "string"
          ? p.text
          : typeof p.delta === "string"
            ? p.delta
            : "";
      if (!text) return [];
      const messageId =
        typeof p.id === "string" && p.id.length > 0 ? p.id : undefined;
      return [{ kind: "token", delta: text, messageId }];
    }
    case "text-end": {
      const messageId = String(p.id ?? "");
      if (!messageId) return [];
      return [{ kind: "text_end", messageId }];
    }
    case "reasoning-delta":
    case "reasoning":
      return [{ kind: "thinking_start" }];
    case "tool-call": {
      const callId = String((p.toolCallId as string | undefined) ?? "");
      const toolName = String((p.toolName as string | undefined) ?? "");
      const input = p.input ?? {};
      return [
        {
          kind: "tool_call_pending",
          call: {
            callId,
            toolName,
            inputJson: JSON.stringify(input ?? {}),
            requestedCapabilities: [],
          },
        },
      ];
    }
    case "tool-result": {
      const callId = String((p.toolCallId as string | undefined) ?? "");
      const toolName = String((p.toolName as string | undefined) ?? "");
      const output = p.output ?? null;
      return [
        {
          kind: "tool_result",
          result: {
            callId,
            toolName,
            outputJson: JSON.stringify(output ?? {}),
            isError: false,
          },
        },
      ];
    }
    case "tool-error": {
      const callId = String((p.toolCallId as string | undefined) ?? "");
      const toolName = String((p.toolName as string | undefined) ?? "");
      const errMsg = String((p.error as { message?: string })?.message ?? "");
      return [
        {
          kind: "tool_result",
          result: {
            callId,
            toolName,
            outputJson: JSON.stringify({ error: errMsg }),
            isError: true,
          },
        },
      ];
    }
    default:
      return [];
  }
}
