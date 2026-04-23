/**
 * Claude client wrapper for Life Module runners.
 *
 * Two modes:
 *   - Plain completion (no schema, no tools) — `runClaudeText`
 *   - Structured-output-with-tools loop — `runClaudeStructured<TOut>`
 *       Uses tool-use to elicit a JSON output that validates against a zod schema.
 *       Optionally exposes extra tools (e.g. `web_search`) which Claude may call
 *       between structured-output attempts.
 *
 * Tool-calls and citations are collected and returned for provenance display
 * in the HTML report renderer.
 *
 * Auth: reads ANTHROPIC_API_KEY from env. Throws at call time if missing.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { Citation, ToolCallRecord } from "./types.ts";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 4096;

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Export it in your shell or .env before running Life Module runners.",
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ClaudeToolDef {
  // Anthropic built-in tools use `type` (e.g. "web_search_20250305") + name.
  // Custom tools use name + description + input_schema (no `type`).
  type?: string;
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  // Per Anthropic web-search tool — optional domain whitelist.
  allowed_domains?: string[];
  max_uses?: number;
}

export interface RunClaudeTextOpts {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  tools?: ClaudeToolDef[];
  timeoutMs?: number;
}

export interface ClaudeTextResult {
  text: string;
  citations: Citation[];
  toolCalls: ToolCallRecord[];
  rawMessage: Anthropic.Message;
  stopReason: string | null;
}

export async function runClaudeText(opts: RunClaudeTextOpts): Promise<ClaudeTextResult> {
  const c = getClient();
  const start = Date.now();
  const msg = await c.messages.create(
    {
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      tools: opts.tools as Anthropic.Tool[] | undefined,
    },
    { timeout: opts.timeoutMs ?? 120_000 },
  );

  return collectTextResult(msg, start);
}

export interface RunClaudeStructuredOpts<TOut> extends Omit<RunClaudeTextOpts, "tools"> {
  /** Zod schema the output must validate against. */
  outputSchema: z.ZodType<TOut>;
  /** Name of the required tool the model should call with the output. */
  outputToolName: string;
  /** Human-readable description shown to the model. */
  outputToolDescription: string;
  /** JSON Schema for the output tool input (derived manually — keep small). */
  outputToolInputSchema: Record<string, unknown>;
  /** Optional extra tools (e.g. web_search) model may use before emitting output. */
  extraTools?: ClaudeToolDef[];
  /** Max structured-output retry attempts on validation failure. Default 2. */
  maxStructuredRetries?: number;
}

export interface ClaudeStructuredResult<TOut> {
  output: TOut;
  citations: Citation[];
  toolCalls: ToolCallRecord[];
  rawMessages: Anthropic.Message[];
}

export async function runClaudeStructured<TOut>(
  opts: RunClaudeStructuredOpts<TOut>,
): Promise<ClaudeStructuredResult<TOut>> {
  const c = getClient();
  const tools: ClaudeToolDef[] = [
    ...(opts.extraTools ?? []),
    {
      name: opts.outputToolName,
      description: opts.outputToolDescription,
      input_schema: opts.outputToolInputSchema,
    },
  ];

  const conversation: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
  const rawMessages: Anthropic.Message[] = [];
  const allCitations: Citation[] = [];
  const allToolCalls: ToolCallRecord[] = [];
  const maxRetries = opts.maxStructuredRetries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    const msg = await c.messages.create(
      {
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: opts.system,
        messages: conversation,
        tools: tools as Anthropic.Tool[],
      },
      { timeout: opts.timeoutMs ?? 180_000 },
    );
    rawMessages.push(msg);
    const collected = collectStructured(msg, start, opts.outputToolName);
    allCitations.push(...collected.citations);
    allToolCalls.push(...collected.toolCalls);

    if (collected.structuredOutput !== undefined) {
      const parsed = opts.outputSchema.safeParse(collected.structuredOutput);
      if (parsed.success) {
        return {
          output: parsed.data,
          citations: allCitations,
          toolCalls: allToolCalls,
          rawMessages,
        };
      }
      conversation.push({ role: "assistant", content: msg.content });
      conversation.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: collected.structuredToolUseId ?? "unknown",
            content: `Schema validation failed: ${parsed.error.message}. Please call ${opts.outputToolName} again with corrected output.`,
            is_error: true,
          },
        ],
      });
      continue;
    }

    // model didn't call the output tool — may have called other tools;
    // feed tool_results back if present.
    if (msg.stop_reason === "tool_use" && collected.nonOutputToolUses.length > 0) {
      conversation.push({ role: "assistant", content: msg.content });
      conversation.push({
        role: "user",
        content: collected.nonOutputToolUses.map((tu) => ({
          type: "tool_result" as const,
          tool_use_id: tu.id,
          content:
            tu.name === "web_search"
              ? "(web_search results delivered directly by Claude)"
              : "(tool executed)",
        })),
      });
      continue;
    }

    // model produced text but no output-tool call — nudge it.
    conversation.push({ role: "assistant", content: msg.content });
    conversation.push({
      role: "user",
      content: `Call the ${opts.outputToolName} tool now with the final structured output.`,
    });
  }

  throw new Error(
    `runClaudeStructured: exhausted ${maxRetries + 1} attempts without a valid structured output for tool ${opts.outputToolName}`,
  );
}

// -------- internal helpers --------

function collectTextResult(msg: Anthropic.Message, startMs: number): ClaudeTextResult {
  const now = new Date().toISOString();
  let text = "";
  const citations: Citation[] = [];
  const toolCalls: ToolCallRecord[] = [];

  for (const block of msg.content) {
    if (block.type === "text") {
      text += block.text;
      // Anthropic attaches citations on text blocks when web_search is used.
      const blockCitations = (block as unknown as { citations?: unknown[] }).citations ?? [];
      for (const raw of blockCitations) {
        const c = raw as Partial<Citation> & {
          url?: string;
          title?: string;
          cited_text?: string;
          encrypted_index?: string;
        };
        if (c.url) {
          citations.push({
            url: c.url,
            title: c.title,
            snippet: c.cited_text,
            fetchedAt: now,
          });
        }
      }
    } else if (block.type === "tool_use") {
      toolCalls.push({
        name: block.name,
        input: block.input,
        startedAt: new Date(startMs).toISOString(),
        endedAt: now,
        errored: false,
      });
    }
  }

  return { text, citations, toolCalls, rawMessage: msg, stopReason: msg.stop_reason };
}

function collectStructured(
  msg: Anthropic.Message,
  startMs: number,
  outputToolName: string,
): {
  structuredOutput: unknown;
  structuredToolUseId?: string;
  citations: Citation[];
  toolCalls: ToolCallRecord[];
  nonOutputToolUses: { id: string; name: string; input: unknown }[];
} {
  const base = collectTextResult(msg, startMs);
  let structuredOutput: unknown = undefined;
  let structuredToolUseId: string | undefined;
  const nonOutputToolUses: { id: string; name: string; input: unknown }[] = [];

  for (const block of msg.content) {
    if (block.type === "tool_use") {
      if (block.name === outputToolName) {
        structuredOutput = block.input;
        structuredToolUseId = block.id;
      } else {
        nonOutputToolUses.push({ id: block.id, name: block.name, input: block.input });
      }
    }
  }

  return {
    structuredOutput,
    structuredToolUseId,
    citations: base.citations,
    toolCalls: base.toolCalls,
    nonOutputToolUses,
  };
}
