import { describe, expect, it } from "vitest";
import {
  clientIp,
  createLimiter,
  isSameOrigin,
  LIMITS,
  parseAskBody,
} from "./guard";

const user = (text: string, id = "u") => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});
const assistant = (text: string, id = "a") => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text }],
});

describe("parseAskBody", () => {
  it("accepts a thread ending on a user question and returns it", () => {
    const r = parseAskBody({
      messages: [
        user("hi", "1"),
        assistant("hello", "2"),
        user("who are you?", "3"),
      ],
    });
    expect(r).toMatchObject({ ok: true, question: "who are you?" });
  });

  it("keeps only text parts, dropping tool, file and reasoning parts", () => {
    const r = parseAskBody({
      messages: [
        {
          id: "1",
          role: "user",
          parts: [
            { type: "file", url: "https://evil.example/x.png" },
            { type: "text", text: "what do you build?" },
            { type: "tool-call", input: {} },
          ],
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.messages).toEqual([
        {
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "what do you build?" }],
        },
      ]);
    }
  });

  it("rejects malformed bodies, system roles and empty threads", () => {
    expect(parseAskBody(null).ok).toBe(false);
    expect(parseAskBody({ messages: [] }).ok).toBe(false);
    expect(
      parseAskBody({
        messages: [{ role: "system", parts: [{ type: "text", text: "x" }] }],
      }).ok,
    ).toBe(false);
  });

  it("requires the last message to be a user turn", () => {
    expect(
      parseAskBody({ messages: [user("q"), assistant("a")] }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("rejects an over-long question and too many messages", () => {
    const long = "x".repeat(LIMITS.maxUserChars + 1);
    expect(parseAskBody({ messages: [user(long)] })).toEqual({
      ok: false,
      error: `Questions are limited to ${LIMITS.maxUserChars} characters.`,
    });
    const tooMany = Array.from({ length: LIMITS.maxMessages + 1 }, (_, i) =>
      user("q", `${i}`),
    );
    expect(parseAskBody({ messages: tooMany }).ok).toBe(false);
  });

  // Regression (cross-review round 1): a 700-token answer runs ~2,800
  // characters. Rejecting it when the client echoes it back broke every
  // later question in the conversation.
  it("keeps the conversation going after a long answer", () => {
    const longAnswer = "z".repeat(2_800);
    const r = parseAskBody({
      messages: [
        user("tell me everything", "1"),
        assistant(longAnswer, "2"),
        user("and then?", "3"),
      ],
    });
    expect(r).toMatchObject({ ok: true, question: "and then?" });
    if (r.ok) expect(r.messages[1].parts[0].text).toBe(longAnswer);
  });

  it("truncates, never rejects, an oversized assistant turn", () => {
    const huge = "z".repeat(LIMITS.maxAssistantChars + 500);
    const r = parseAskBody({
      messages: [user("q", "1"), assistant(huge, "2"), user("next", "3")],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.messages[1].parts[0].text.length).toBeLessThanOrEqual(
        LIMITS.maxAssistantChars + 2,
      );
    }
  });

  it("drops the oldest turns to fit the character budget instead of failing", () => {
    const answer = "y".repeat(LIMITS.maxAssistantChars);
    const thread = Array.from({ length: 9 }, (_, i) =>
      i % 2 === 0 ? user(`q${i}`, `${i}`) : assistant(answer, `${i}`),
    );
    const r = parseAskBody({ messages: thread });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const chars = r.messages.reduce((n, m) => n + m.parts[0].text.length, 0);
      expect(chars).toBeLessThanOrEqual(LIMITS.maxWindowChars);
      expect(r.messages[0].role).toBe("user");
      expect(r.messages.at(-1)?.parts[0].text).toBe("q8");
    }
  });

  it("forwards the most recent window, opening on a user turn", () => {
    const thread = Array.from({ length: 15 }, (_, i) =>
      i % 2 === 0 ? user(`q${i}`, `${i}`) : assistant(`a${i}`, `${i}`),
    );
    const r = parseAskBody({ messages: thread });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // slice(-10) of an odd-length alternating thread opens on an
      // assistant turn; it is dropped (Bedrock rejects that shape).
      expect(r.messages).toHaveLength(LIMITS.modelWindow - 1);
      expect(r.messages[0]).toMatchObject({ role: "user" });
      expect(r.messages.at(-1)?.parts[0].text).toBe("q14");
    }
  });
});

describe("createLimiter", () => {
  it("allows the per-minute budget, refuses the next, and recovers", () => {
    let t = 1_000_000;
    const limiter = createLimiter(() => t);
    for (let i = 0; i < LIMITS.perIpPerMinute; i++) {
      expect(limiter.check("1.1.1.1").ok).toBe(true);
    }
    const refused = limiter.check("1.1.1.1");
    expect(refused).toMatchObject({ ok: false, window: "ip-minute" });
    if (!refused.ok) expect(refused.retryAfterSec).toBeGreaterThan(0);

    // Another client is unaffected.
    expect(limiter.check("2.2.2.2").ok).toBe(true);

    t += 61_000;
    expect(limiter.check("1.1.1.1").ok).toBe(true);
  });

  it("enforces the per-IP daily budget across minutes", () => {
    let t = 0;
    const limiter = createLimiter(() => t);
    let allowed = 0;
    for (let minute = 0; minute < 60; minute++) {
      t = minute * 61_000;
      for (let i = 0; i < LIMITS.perIpPerMinute; i++) {
        if (limiter.check("3.3.3.3").ok) allowed++;
      }
    }
    expect(allowed).toBe(LIMITS.perIpPerDay);
  });
});

describe("request helpers", () => {
  it("reads the first forwarded IP", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })),
    ).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("accepts same-origin or origin-less requests, refuses cross-origin", () => {
    expect(
      isSameOrigin(
        new Headers({ origin: "https://broomva.tech", host: "broomva.tech" }),
      ),
    ).toBe(true);
    expect(isSameOrigin(new Headers({ host: "broomva.tech" }))).toBe(true);
    expect(
      isSameOrigin(
        new Headers({ origin: "https://evil.example", host: "broomva.tech" }),
      ),
    ).toBe(false);
    expect(
      isSameOrigin(new Headers({ origin: "null", host: "broomva.tech" })),
    ).toBe(false);
  });
});
