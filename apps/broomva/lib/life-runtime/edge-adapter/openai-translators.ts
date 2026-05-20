/**
 * OpenAI Chat Completions ↔ Anthropic translation helpers.
 *
 * Pure functions — no I/O, no state. These bridge the OpenAI request
 * shape (`role: "system" | "user" | "assistant" | "tool"`, `function`
 * tool definitions) onto the Anthropic-flavoured envelope the lifed
 * agent loop accepts.
 *
 * Decision D3 (locked in PR-1 of BRO-1208): OpenAI `role: "tool"`
 * messages translate to Anthropic `tool_result` content blocks. The
 * canonical lifed runtime keeps server-side conversation history via
 * the sticky sid (D1), so most of the translation work here is
 * extracting the latest user turn + reshaping tool definitions; full
 * history replay is the gateway's responsibility.
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 *       (§"Wire shape — OpenAI Chat Completions", §"Tool integration")
 */

import "server-only";
import type {
  AnthropicTextContentBlock,
  AnthropicTool,
  AnthropicToolResultContentBlock,
} from "./types";

// ---------------------------------------------------------------------------
// OpenAI request shape (subset we care about)
// ---------------------------------------------------------------------------

/**
 * OpenAI Chat Completions message — subset we need. Real OpenAI shape
 * also includes `name`, `function_call` (legacy), and per-role variants;
 * we only need enough to extract user text + translate tool-result
 * bridging into Anthropic.
 *
 * Content per role:
 *   - `system`: string (or array of `{type: "text", text}` parts)
 *   - `user`:   string OR array of `{type: "text"|"image_url", ...}` parts
 *   - `assistant`: string | null, may carry `tool_calls[]`
 *   - `tool`:   string content, MUST carry `tool_call_id`
 */
export interface OpenAIMessageBase {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null | Array<OpenAIContentPart>;
}

export interface OpenAIContentTextPart {
  type: "text";
  text: string;
}

export interface OpenAIContentImageUrlPart {
  type: "image_url";
  image_url: { url: string; detail?: "low" | "high" | "auto" };
}

export type OpenAIContentPart =
  | OpenAIContentTextPart
  | OpenAIContentImageUrlPart;

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAIAssistantMessage extends OpenAIMessageBase {
  role: "assistant";
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIToolMessage extends OpenAIMessageBase {
  role: "tool";
  tool_call_id: string;
  /** `content` is required for tool messages — the tool's serialized output. */
  content: string | Array<OpenAIContentPart>;
}

export type OpenAIMessage =
  | OpenAIMessageBase
  | OpenAIAssistantMessage
  | OpenAIToolMessage;

/**
 * OpenAI tool definition — only `function` shape exists in v1 of the
 * Chat Completions tools field. The `parameters` slot is a JSON Schema
 * object the model uses to choose / validate arguments.
 */
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      [k: string]: unknown;
    };
  };
}

// ---------------------------------------------------------------------------
// Translation — request side
// ---------------------------------------------------------------------------

/**
 * Pull the latest user-message text from an OpenAI `messages[]` array.
 *
 * The lifed `stream()` API takes a single `userMessage` string; the
 * sticky sid (D1) reuses the existing session if the prefix matches,
 * so lifed already has the prior turns on its side. We only forward
 * the *latest user turn* as the per-turn input.
 *
 * Behaviour:
 *   - Walks `messages[]` in reverse until it finds a `role: "user"`
 *     entry; concatenates its text content (drops image parts, drops
 *     null/empty content).
 *   - Returns `""` when no user message is present (the route caller
 *     surfaces a 400 in that case — see route validation).
 *
 * Tool-result messages (`role: "tool"`) are NOT treated as the latest
 * user turn — they're transcript glue between turns. When the caller
 * sends a tool-result message followed by an implicit "continue"
 * request, the route should detect the `role: "tool"` tail and either
 * (a) forward it as conversation context (D3 handled separately) or
 * (b) reject the request as ambiguous. PR-2 takes path (b): tool
 * messages cannot be the final entry, mirroring the Anthropic-side
 * "last entry must be role:user" validation.
 */
export function openaiMessagesToLatestUserText(
  messages: OpenAIMessage[],
): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    return flattenContent(m.content);
  }
  return "";
}

/**
 * Flatten an OpenAI message `content` field to plain text. Strings pass
 * through; arrays concat the `text` parts; nullish returns `""`.
 * Image parts are intentionally dropped — Anthropic image translation
 * is a separate concern not required for PR-2 (alpine-cabin chat is
 * text-only).
 */
function flattenContent(content: OpenAIMessage["content"] | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const part of content) {
    if (part && typeof part === "object" && part.type === "text") {
      out.push(part.text);
    }
  }
  return out.join("");
}

/**
 * Translate OpenAI `tools[]` into Anthropic-shape tool definitions.
 *
 * OpenAI: `{type: "function", function: {name, description, parameters}}`
 * Anthropic: `{name, description, input_schema}`
 *
 * The `parameters` JSON Schema maps directly onto `input_schema` — both
 * are JSON Schema Draft-2019 dialects, both with `type: "object"`,
 * `properties`, `required`. We default the inner `type` to `"object"`
 * when missing (which is what OpenAI does too — undocumented but
 * universal in practice).
 *
 * Skips invalid entries silently rather than throwing — the route
 * validator catches bad request shapes upfront; this function trusts
 * its input.
 */
export function openaiToolsToAnthropicTools(
  tools: OpenAITool[] | undefined,
): AnthropicTool[] | undefined {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return undefined;
  const out: AnthropicTool[] = [];
  for (const t of tools) {
    if (!t || t.type !== "function" || !t.function?.name) continue;
    const params = t.function.parameters ?? {};
    // Anthropic requires `input_schema.type === "object"`. Default for
    // safety — OpenAI implicitly assumes object too.
    const inputSchema: AnthropicTool["input_schema"] = {
      type: "object",
      ...(params.properties ? { properties: params.properties } : {}),
      ...(params.required ? { required: params.required } : {}),
    };
    // Copy any additional JSON Schema fields the caller set (e.g.
    // `additionalProperties`, `$defs`) — they're valid in both dialects.
    for (const [k, v] of Object.entries(params)) {
      if (k === "type" || k === "properties" || k === "required") continue;
      inputSchema[k] = v;
    }
    const entry: AnthropicTool = {
      name: t.function.name,
      input_schema: inputSchema,
    };
    if (t.function.description) entry.description = t.function.description;
    out.push(entry);
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Translate an OpenAI tool-result message (`role: "tool"`) into an
 * Anthropic `tool_result` content block — Decision D3.
 *
 * OpenAI: `{role: "tool", tool_call_id: "call_…", content: "<json or text>"}`
 * Anthropic: `{type: "tool_result", tool_use_id: "call_…", content: <…>}`
 *
 * The `content` field on the Anthropic side accepts either a plain
 * string or an array of text/image blocks; we mirror what the caller
 * sent — string stays string, array gets re-shaped to Anthropic blocks
 * (text only; image-result tool outputs aren't supported in v1).
 *
 * This function is invoked when the route needs to surface a
 * tool-result back into Anthropic-flavoured history (e.g. for non-
 * sticky-sid fallback paths). PR-2 doesn't yet exercise it on the
 * latest-user-turn fast path, but the translator is in place so future
 * PRs (full multi-turn replay) can reuse it.
 */
export function openaiToolResultToAnthropic(msg: {
  role: "tool";
  tool_call_id: string;
  content: OpenAIToolMessage["content"];
}): AnthropicToolResultContentBlock {
  const out: AnthropicToolResultContentBlock = {
    type: "tool_result",
    tool_use_id: msg.tool_call_id,
  };
  const content = msg.content;
  if (typeof content === "string") {
    out.content = content;
    return out;
  }
  if (Array.isArray(content)) {
    const blocks: AnthropicTextContentBlock[] = [];
    for (const part of content) {
      if (part && typeof part === "object" && part.type === "text") {
        blocks.push({ type: "text", text: part.text });
      }
    }
    if (blocks.length > 0) out.content = blocks;
    return out;
  }
  return out;
}
