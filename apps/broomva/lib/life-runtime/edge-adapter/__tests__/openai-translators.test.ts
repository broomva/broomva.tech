// Unit tests for OpenAI ↔ Anthropic translation helpers.
//
// Covers:
//   1. `openaiMessagesToLatestUserText`:
//      - empty messages, only-assistant messages → ""
//      - single user message → returns content
//      - multi-turn — returns LATEST user text, not first
//      - array content with `type: "text"` parts → concatenated
//      - image_url parts → dropped
//   2. `openaiToolsToAnthropicTools`:
//      - shape mapping: `{type:"function",function:{name,description,parameters}}`
//         → `{name,description,input_schema}`
//      - parameters defaulting to `type: "object"` when missing
//      - skipping malformed entries (no name, wrong type)
//      - undefined / empty input → undefined
//   3. `openaiToolResultToAnthropic`:
//      - string content → string `content`
//      - text-array content → text-block array `content`
//      - image content dropped (text-only blocks survive)
//      - empty content → no `content` field
//
// File under test: ../openai-translators.ts

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  type OpenAIMessage,
  type OpenAITool,
  openaiMessagesToLatestUserText,
  openaiToolResultToAnthropic,
  openaiToolsToAnthropicTools,
} from "../openai-translators";

// ---------------------------------------------------------------------------
// openaiMessagesToLatestUserText
// ---------------------------------------------------------------------------

describe("openaiMessagesToLatestUserText", () => {
  it("returns empty string on empty messages[]", () => {
    expect(openaiMessagesToLatestUserText([])).toBe("");
  });

  it("returns empty string when no user message is present", () => {
    const msgs: OpenAIMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "assistant", content: "Hello!" },
    ];
    expect(openaiMessagesToLatestUserText(msgs)).toBe("");
  });

  it("returns the single user message content", () => {
    const msgs: OpenAIMessage[] = [{ role: "user", content: "Hi there." }];
    expect(openaiMessagesToLatestUserText(msgs)).toBe("Hi there.");
  });

  it("returns the LATEST user message text, not the first", () => {
    const msgs: OpenAIMessage[] = [
      { role: "user", content: "First turn." },
      { role: "assistant", content: "Reply." },
      { role: "user", content: "Second turn." },
    ];
    expect(openaiMessagesToLatestUserText(msgs)).toBe("Second turn.");
  });

  it("flattens array-shaped text content", () => {
    const msgs: OpenAIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Hello, " },
          { type: "text", text: "world!" },
        ],
      },
    ];
    expect(openaiMessagesToLatestUserText(msgs)).toBe("Hello, world!");
  });

  it("drops image_url parts and keeps text", () => {
    const msgs: OpenAIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Look at this: " },
          { type: "image_url", image_url: { url: "https://example/foo.png" } },
          { type: "text", text: "what is it?" },
        ],
      },
    ];
    expect(openaiMessagesToLatestUserText(msgs)).toBe(
      "Look at this: what is it?",
    );
  });

  it("returns empty string when latest user content is null", () => {
    const msgs: OpenAIMessage[] = [{ role: "user", content: null }];
    expect(openaiMessagesToLatestUserText(msgs)).toBe("");
  });

  it("walks past trailing tool messages to find the prior user message", () => {
    // Note: the route REJECTS tool-tail requests at validation time, but
    // the translator should still walk correctly when given them — the
    // function's job is "find the latest user text".
    const msgs: OpenAIMessage[] = [
      { role: "user", content: "User asked something." },
      {
        role: "assistant",
        content: null,
      },
      {
        role: "tool",
        tool_call_id: "call_x",
        content: "tool returned 42",
      },
    ];
    expect(openaiMessagesToLatestUserText(msgs)).toBe("User asked something.");
  });
});

// ---------------------------------------------------------------------------
// openaiToolsToAnthropicTools
// ---------------------------------------------------------------------------

describe("openaiToolsToAnthropicTools", () => {
  it("returns undefined for undefined / empty input", () => {
    expect(openaiToolsToAnthropicTools(undefined)).toBeUndefined();
    expect(openaiToolsToAnthropicTools([])).toBeUndefined();
  });

  it("maps function shape onto input_schema shape", () => {
    const tools: OpenAITool[] = [
      {
        type: "function",
        function: {
          name: "update_cabin_params",
          description: "Update cabin design parameters.",
          parameters: {
            type: "object",
            properties: {
              updates: {
                type: "object",
                additionalProperties: { type: "number" },
              },
              explain: { type: "string" },
            },
            required: ["updates"],
          },
        },
      },
    ];
    const out = openaiToolsToAnthropicTools(tools);
    expect(out).toBeDefined();
    expect(out).toHaveLength(1);
    const t = out![0];
    expect(t.name).toBe("update_cabin_params");
    expect(t.description).toBe("Update cabin design parameters.");
    expect(t.input_schema.type).toBe("object");
    expect(t.input_schema.properties).toEqual({
      updates: {
        type: "object",
        additionalProperties: { type: "number" },
      },
      explain: { type: "string" },
    });
    expect(t.input_schema.required).toEqual(["updates"]);
  });

  it("defaults input_schema.type to 'object' when parameters omitted", () => {
    const tools: OpenAITool[] = [
      {
        type: "function",
        function: { name: "noop" },
      },
    ];
    const out = openaiToolsToAnthropicTools(tools);
    expect(out).toBeDefined();
    expect(out![0].input_schema.type).toBe("object");
  });

  it("preserves extra JSON Schema fields like additionalProperties", () => {
    const tools: OpenAITool[] = [
      {
        type: "function",
        function: {
          name: "strict_call",
          parameters: {
            type: "object",
            properties: { x: { type: "number" } },
            additionalProperties: false,
            $defs: { someDef: { type: "string" } },
          },
        },
      },
    ];
    const out = openaiToolsToAnthropicTools(tools);
    expect(out![0].input_schema.additionalProperties).toBe(false);
    expect(out![0].input_schema.$defs).toEqual({
      someDef: { type: "string" },
    });
  });

  it("skips malformed entries silently (no name, wrong type)", () => {
    // Build via `unknown` then cast — the function takes `OpenAITool[]`
    // for the type-safe call site, but runtime defenses should still
    // hold against malformed entries that bypass typechecking (e.g.
    // body parsed from untrusted JSON).
    const tools = [
      { type: "function", function: { name: "good" } },
      { type: "function", function: {} }, // missing name
      { type: "code_interpreter", function: { name: "ignored" } }, // wrong type
      null,
      undefined,
    ] as unknown as OpenAITool[];
    const out = openaiToolsToAnthropicTools(tools);
    expect(out).toBeDefined();
    expect(out).toHaveLength(1);
    expect(out![0].name).toBe("good");
  });

  it("omits description when not provided", () => {
    const tools: OpenAITool[] = [
      { type: "function", function: { name: "no_desc" } },
    ];
    const out = openaiToolsToAnthropicTools(tools);
    expect(out![0].description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// openaiToolResultToAnthropic
// ---------------------------------------------------------------------------

describe("openaiToolResultToAnthropic", () => {
  it("maps string content directly", () => {
    const out = openaiToolResultToAnthropic({
      role: "tool",
      tool_call_id: "call_abc123",
      content: "42",
    });
    expect(out.type).toBe("tool_result");
    expect(out.tool_use_id).toBe("call_abc123");
    expect(out.content).toBe("42");
  });

  it("maps array content with text parts into Anthropic text blocks", () => {
    const out = openaiToolResultToAnthropic({
      role: "tool",
      tool_call_id: "call_x",
      content: [
        { type: "text", text: "Result line 1\n" },
        { type: "text", text: "Result line 2" },
      ],
    });
    expect(out.content).toEqual([
      { type: "text", text: "Result line 1\n" },
      { type: "text", text: "Result line 2" },
    ]);
  });

  it("drops image_url parts in array content", () => {
    const out = openaiToolResultToAnthropic({
      role: "tool",
      tool_call_id: "call_y",
      content: [
        { type: "text", text: "Image generated:" },
        { type: "image_url", image_url: { url: "https://x/y.png" } },
      ],
    });
    // Only the text block survives — image-result tool outputs aren't
    // supported in PR-2.
    expect(out.content).toEqual([{ type: "text", text: "Image generated:" }]);
  });

  it("omits content field entirely when array has no text parts", () => {
    const out = openaiToolResultToAnthropic({
      role: "tool",
      tool_call_id: "call_z",
      content: [{ type: "image_url", image_url: { url: "https://x/y.png" } }],
    });
    expect(out.content).toBeUndefined();
  });

  it("preserves the tool_call_id as tool_use_id", () => {
    const out = openaiToolResultToAnthropic({
      role: "tool",
      tool_call_id: "call_VERY_SPECIFIC_ID",
      content: "ok",
    });
    expect(out.tool_use_id).toBe("call_VERY_SPECIFIC_ID");
  });
});
