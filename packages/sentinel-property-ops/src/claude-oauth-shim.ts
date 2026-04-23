/**
 * Claude client shim for OAuth-token auth.
 *
 * The shared `@broomva/life-modules-core` `runClaudeStructured` instantiates
 * the Anthropic SDK with `apiKey` only. That works for `sk-ant-api03-…` keys.
 * It does not work for `sk-ant-oat01-…` OAuth tokens (which is what a Claude
 * Code session has at hand — no separate API key). OAuth tokens need:
 *   - `Authorization: Bearer <token>` (not `X-Api-Key`)
 *   - `anthropic-beta: oauth-2025-04-20`
 *   - a system prompt that starts with Claude Code's preamble
 *
 * This shim implements the same structured-output loop the core client does,
 * but talks to the Messages API over raw fetch. Used when `SENTINEL_USE_OAUTH_SHIM=1`
 * is in the environment. Core is left untouched.
 *
 * Not a permanent solution — the shared client should grow native support.
 * Logged as a follow-up in the run report.
 */

import type { z } from "zod";
import type {
  Citation,
  ToolCallRecord,
} from "@broomva/life-modules-core";

export interface OauthToolDef {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

export interface OauthStructuredOpts<TOut> {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
  outputSchema: z.ZodType<TOut>;
  outputToolName: string;
  outputToolDescription: string;
  outputToolInputSchema: Record<string, unknown>;
  extraTools?: OauthToolDef[];
  maxStructuredRetries?: number;
  timeoutMs?: number;
}

export interface OauthStructuredResult<TOut> {
  output: TOut;
  citations: Citation[];
  toolCalls: ToolCallRecord[];
  rawMessages: unknown[];
}

const CC_PREAMBLE =
  "You are Claude Code, Anthropic's official CLI for Claude.";

interface AnthropicContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: unknown;
  citations?: Array<{
    url?: string;
    title?: string;
    cited_text?: string;
  }>;
}

interface AnthropicMessage {
  id: string;
  role: string;
  model: string;
  stop_reason: string | null;
  content: AnthropicContentBlock[];
}

function composedSystem(system: string): string {
  if (system.startsWith(CC_PREAMBLE)) return system;
  return `${CC_PREAMBLE}\n\n${system}`;
}

async function postOnce(
  body: Record<string, unknown>,
  token: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function post(
  body: Record<string, unknown>,
  token: string,
  timeoutMs: number,
): Promise<AnthropicMessage> {
  const backoff = [2_000, 8_000, 20_000, 45_000];
  let lastErr = "";
  for (let i = 0; i < backoff.length; i++) {
    const r = await postOnce(body, token, timeoutMs);
    if (r.ok) return JSON.parse(r.text) as AnthropicMessage;
    lastErr = `${r.status}: ${r.text}`;
    // Retry only on rate-limit / transient server errors.
    if (r.status === 429 || r.status >= 500) {
      const wait = backoff[i];
      // eslint-disable-next-line no-console
      console.log(
        `\x1b[33m  ⟳ Anthropic ${r.status}, backing off ${wait / 1000}s (attempt ${i + 1}/${backoff.length})\x1b[0m`,
      );
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    throw new Error(`Anthropic ${lastErr}`);
  }
  throw new Error(`Anthropic retries exhausted: ${lastErr}`);
}

export async function runClaudeStructuredOauth<TOut>(
  opts: OauthStructuredOpts<TOut>,
): Promise<OauthStructuredResult<TOut>> {
  const token =
    process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY;
  if (!token) {
    throw new Error(
      "OAuth shim: no ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY in env.",
    );
  }

  const tools = [
    ...(opts.extraTools ?? []),
    {
      name: opts.outputToolName,
      description: opts.outputToolDescription,
      input_schema: opts.outputToolInputSchema,
    },
  ];

  const system = composedSystem(opts.system);

  interface Msg {
    role: "user" | "assistant";
    content: unknown;
  }
  const messages: Msg[] = [{ role: "user", content: opts.user }];
  const rawMessages: AnthropicMessage[] = [];
  const citations: Citation[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const maxRetries = opts.maxStructuredRetries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const maxTokens = opts.maxTokens ?? 4096;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    const msg = await post(
      {
        model: opts.model,
        max_tokens: maxTokens,
        system,
        messages,
        tools,
      },
      token,
      timeoutMs,
    );
    rawMessages.push(msg);

    let structuredInput: unknown;
    let structuredToolUseId: string | undefined;
    const nonOutputToolUses: Array<{ id: string; name: string; input: unknown }> =
      [];
    const now = new Date().toISOString();

    for (const block of msg.content) {
      if (block.type === "tool_use") {
        if (block.name === opts.outputToolName) {
          structuredInput = block.input;
          structuredToolUseId = block.id;
        } else if (block.name && block.id) {
          nonOutputToolUses.push({
            id: block.id,
            name: block.name,
            input: block.input,
          });
        }
        toolCalls.push({
          name: block.name ?? "unknown",
          input: block.input,
          startedAt: new Date(start).toISOString(),
          endedAt: now,
          errored: false,
        });
      } else if (block.type === "text" && block.citations) {
        for (const c of block.citations) {
          if (c.url) {
            citations.push({
              url: c.url,
              title: c.title,
              snippet: c.cited_text,
              fetchedAt: now,
            });
          }
        }
      }
    }

    if (structuredInput !== undefined) {
      const parsed = opts.outputSchema.safeParse(structuredInput);
      if (parsed.success) {
        return {
          output: parsed.data,
          citations,
          toolCalls,
          rawMessages,
        };
      }
      // Schema violation — feed back error and retry.
      messages.push({ role: "assistant", content: msg.content });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: structuredToolUseId ?? "unknown",
            content: `Schema validation failed: ${parsed.error.message}. Call ${opts.outputToolName} again with corrected output.`,
            is_error: true,
          },
        ],
      });
      continue;
    }

    if (msg.stop_reason === "tool_use" && nonOutputToolUses.length > 0) {
      messages.push({ role: "assistant", content: msg.content });
      messages.push({
        role: "user",
        content: nonOutputToolUses.map((tu) => ({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "(tool executed)",
        })),
      });
      continue;
    }

    // Text-only response — nudge model to call the tool.
    messages.push({ role: "assistant", content: msg.content });
    messages.push({
      role: "user",
      content: `Call the ${opts.outputToolName} tool now with the full structured output.`,
    });
  }

  throw new Error(
    `OAuth shim: exhausted ${maxRetries + 1} attempts without a valid structured output for ${opts.outputToolName}`,
  );
}
