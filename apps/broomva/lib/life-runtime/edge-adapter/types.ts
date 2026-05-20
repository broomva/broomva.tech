/**
 * Shared types for the `/api/v1/messages` (Anthropic Messages) edge
 * adapter — and, in later PRs, `/api/v1/chat/completions` (OpenAI).
 *
 * These mirror the public surface of `@anthropic-ai/sdk` so byte-faithful
 * round-trip with off-the-shelf SDK callers is possible. We intentionally
 * keep the wire shape narrow (no internal-only fields) so the adapter is
 * a strict translation boundary, not a "shape with extras" surface.
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 */

import "server-only";

// ---------------------------------------------------------------------------
// Auth context — populated by `resolveEdgeAuth`
// ---------------------------------------------------------------------------

/**
 * Resolved per-request auth state. The edge route gets this OR a 401.
 *
 * The `tier1Token` is ALWAYS an ES256 lifegw Tier-1 cap minted via
 * `mintTier1ForConsumer`. When the caller presented an HS256 broomva.tech
 * access_token in the Authorization header, the adapter re-minted into
 * lifegw form internally — callers downstream never see the original.
 *
 * `source` distinguishes how the user was identified so observability can
 * tag the run (CLI/SDK vs browser).
 */
export interface EdgeAuthContext {
  tier1Token: string;
  userId: string;
  projectId: string;
  source: "header" | "session";
}

// ---------------------------------------------------------------------------
// Anthropic Messages API — request
// ---------------------------------------------------------------------------

export interface AnthropicTextContentBlock {
  type: "text";
  text: string;
}

export interface AnthropicImageContentBlock {
  type: "image";
  source:
    | {
        type: "base64";
        media_type: string;
        data: string;
      }
    | {
        type: "url";
        url: string;
      };
}

export interface AnthropicToolUseContentBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultContentBlock {
  type: "tool_result";
  tool_use_id: string;
  content?:
    | string
    | Array<AnthropicTextContentBlock | AnthropicImageContentBlock>;
  is_error?: boolean;
}

export type AnthropicContentBlock =
  | AnthropicTextContentBlock
  | AnthropicImageContentBlock
  | AnthropicToolUseContentBlock
  | AnthropicToolResultContentBlock;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [k: string]: unknown;
  };
}

export type AnthropicToolChoice =
  | { type: "auto"; disable_parallel_tool_use?: boolean }
  | { type: "any"; disable_parallel_tool_use?: boolean }
  | { type: "tool"; name: string; disable_parallel_tool_use?: boolean }
  | { type: "none" };

export interface AnthropicMessagesRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string | AnthropicTextContentBlock[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
  metadata?: { user_id?: string; [k: string]: unknown };
}

// ---------------------------------------------------------------------------
// Anthropic Messages API — non-stream response
// ---------------------------------------------------------------------------

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export type AnthropicStopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | "pause_turn"
  | "refusal";

export interface AnthropicMessagesResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<AnthropicTextContentBlock | AnthropicToolUseContentBlock>;
  model: string;
  stop_reason: AnthropicStopReason | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

// ---------------------------------------------------------------------------
// Anthropic Messages API — SSE event stream
// ---------------------------------------------------------------------------

/**
 * Discriminated union over the SSE events Anthropic publishes for a
 * streaming Messages request. The adapter emits these in the exact order
 * the SDK expects:
 *
 *   message_start
 *     [ content_block_start, content_block_delta…, content_block_stop ] ×N
 *   message_delta
 *   message_stop
 *
 * `ping` is allowed at any point (we emit none today; reserved for
 * heartbeat).
 * `error` may terminate the stream at any point.
 */
export type AnthropicStreamEvent =
  | {
      type: "message_start";
      message: {
        id: string;
        type: "message";
        role: "assistant";
        content: [];
        model: string;
        stop_reason: null;
        stop_sequence: null;
        usage: AnthropicUsage;
      };
    }
  | {
      type: "content_block_start";
      index: number;
      content_block:
        | { type: "text"; text: "" }
        | {
            type: "tool_use";
            id: string;
            name: string;
            input: Record<string, unknown>;
          };
    }
  | {
      type: "content_block_delta";
      index: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "input_json_delta"; partial_json: string };
    }
  | {
      type: "content_block_stop";
      index: number;
    }
  | {
      type: "message_delta";
      delta: {
        stop_reason: AnthropicStopReason | null;
        stop_sequence: string | null;
      };
      usage: AnthropicUsage;
    }
  | { type: "message_stop" }
  | { type: "ping" }
  | {
      type: "error";
      error: {
        type: string;
        message: string;
      };
    };

// ---------------------------------------------------------------------------
// Anthropic error envelope (non-stream)
// ---------------------------------------------------------------------------

export interface AnthropicErrorBody {
  type: "error";
  error: {
    type:
      | "invalid_request_error"
      | "authentication_error"
      | "permission_error"
      | "not_found_error"
      | "request_too_large"
      | "rate_limit_error"
      | "api_error"
      | "overloaded_error"
      | string;
    message: string;
  };
}
