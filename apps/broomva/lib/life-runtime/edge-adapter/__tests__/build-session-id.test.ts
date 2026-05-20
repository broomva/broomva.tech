// Unit tests for the sticky-session id derivation.
//
// Covers the D1 contract:
//   1. Same prefix (everything except the latest message) → same sid,
//      regardless of what the latest message is.
//   2. Different prefix → different sid.
//   3. First-turn calls (length ≤ 1) include the latest message in the
//      hash so distinct openers don't collide.
//   4. Output is 32 hex characters (truncated SHA-256).
//   5. Canonical-JSON serialisation: client-side key reordering does NOT
//      change the sid.
//
// File under test: ../build-session-id.ts

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildStickySessionId } from "../build-session-id";
import type { AnthropicMessage } from "../types";

const helloUser: AnthropicMessage = { role: "user", content: "Hello." };
const greetingAssistant: AnthropicMessage = {
  role: "assistant",
  content: "Hi! How can I help?",
};
const followupUser: AnthropicMessage = {
  role: "user",
  content: "Tell me a joke.",
};
const otherFollowup: AnthropicMessage = {
  role: "user",
  content: "What's the weather?",
};

describe("buildStickySessionId — output shape", () => {
  it("returns 32 lowercase hex characters", () => {
    const sid = buildStickySessionId([helloUser]);
    expect(sid).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns a non-empty hex string for an empty messages array", () => {
    // Defensive: even though the route rejects empty messages, the
    // hash function itself should not throw.
    const sid = buildStickySessionId([]);
    expect(sid).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("buildStickySessionId — multi-turn continuity (D1 core)", () => {
  it("produces the SAME sid for two turns sharing the same prefix", () => {
    // Conversation: user → assistant → user. Second user message
    // varies but the prefix [user, assistant] is identical.
    const sidA = buildStickySessionId([
      helloUser,
      greetingAssistant,
      followupUser,
    ]);
    const sidB = buildStickySessionId([
      helloUser,
      greetingAssistant,
      otherFollowup,
    ]);
    expect(sidA).toBe(sidB);
  });

  it("produces DIFFERENT sids when the prefix differs", () => {
    // Two distinct conversations — different first user message →
    // different prefix → different sid.
    const sidA = buildStickySessionId([
      helloUser,
      greetingAssistant,
      followupUser,
    ]);
    const sidB = buildStickySessionId([
      { role: "user", content: "Something totally different." },
      greetingAssistant,
      followupUser,
    ]);
    expect(sidA).not.toBe(sidB);
  });

  it("first-turn calls with the same single message collapse to the same sid", () => {
    // Two cold-opens with identical first message → same sticky sid →
    // lifed sees the resume hit and re-attaches the existing session.
    // This is the deduplication property the spec calls out: a CLI tool
    // accidentally re-firing the same first turn doesn't waste a new
    // session.
    const sidA = buildStickySessionId([helloUser]);
    const sidB = buildStickySessionId([helloUser]);
    expect(sidA).toBe(sidB);
  });

  it("first-turn calls with different messages produce different sids", () => {
    // Empty prefix BUT we mix in the latest message — so two fresh
    // conversations with distinct openers don't collide.
    const sidA = buildStickySessionId([helloUser]);
    const sidB = buildStickySessionId([
      { role: "user", content: "Different opener." },
    ]);
    expect(sidA).not.toBe(sidB);
  });

  it("zero-message array does not throw, returns a stable constant", () => {
    const sidA = buildStickySessionId([]);
    const sidB = buildStickySessionId([]);
    expect(sidA).toBe(sidB);
  });
});

describe("buildStickySessionId — canonical JSON (key-order independence)", () => {
  it("key-reordered prefix messages produce the same sid", () => {
    // Some clients build message objects via `{role: ..., content: ...}`
    // while others build via `{content: ..., role: ...}`. Both should
    // hash identically.
    const msgA: AnthropicMessage = { role: "user", content: "Hi" };
    const msgB = { content: "Hi", role: "user" } as AnthropicMessage;
    const sidA = buildStickySessionId([msgA, greetingAssistant, followupUser]);
    const sidB = buildStickySessionId([msgB, greetingAssistant, followupUser]);
    expect(sidA).toBe(sidB);
  });

  it("structured content blocks with reordered keys hash identically", () => {
    const msgA: AnthropicMessage = {
      role: "user",
      content: [{ type: "text", text: "Hi" }],
    };
    const msgB = {
      role: "user",
      content: [{ text: "Hi", type: "text" }],
    } as AnthropicMessage;
    const sidA = buildStickySessionId([msgA, greetingAssistant, followupUser]);
    const sidB = buildStickySessionId([msgB, greetingAssistant, followupUser]);
    expect(sidA).toBe(sidB);
  });
});
