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

  it("enforces per-message, total and count limits", () => {
    const long = "x".repeat(LIMITS.maxCharsPerMessage + 1);
    expect(parseAskBody({ messages: [user(long)] }).ok).toBe(false);

    const chunk = "y".repeat(LIMITS.maxCharsPerMessage);
    const many = Array.from({ length: 9 }, (_, i) =>
      i % 2 === 0 ? user(chunk, `${i}`) : assistant(chunk, `${i}`),
    );
    expect(parseAskBody({ messages: many }).ok).toBe(false); // 18k > 16k total

    const tooMany = Array.from({ length: LIMITS.maxMessages + 1 }, (_, i) =>
      user("q", `${i}`),
    );
    expect(parseAskBody({ messages: tooMany }).ok).toBe(false);
  });

  it("forwards only the most recent window to the model", () => {
    const thread = Array.from({ length: 15 }, (_, i) =>
      i % 2 === 0 ? user(`q${i}`, `${i}`) : assistant(`a${i}`, `${i}`),
    );
    const r = parseAskBody({ messages: thread });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.messages).toHaveLength(LIMITS.modelWindow);
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
    expect(refused.ok).toBe(false);
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
