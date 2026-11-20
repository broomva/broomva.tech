import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const retrieved = [
  {
    title: "Life",
    url: "/projects/life",
    summary: "Rust Agent OS",
    excerpt: "Arcan runtime",
  },
];
vi.mock("@/lib/twin/retrieve", () => ({
  retrieveForQuestion: vi.fn(async () => retrieved),
}));

let model: MockLanguageModelV3;
vi.mock("@ai-sdk/gateway", () => ({ gateway: () => model }));

function streamingModel(chunks: string[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          ...chunks.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 5, text: 5, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });
}

function ask(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://broomva.tech/api/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "broomva.tech",
      origin: "https://broomva.tech",
      "x-forwarded-for": headers["x-forwarded-for"] ?? "203.0.113.7",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const question = (text: string) => ({
  messages: [{ id: "1", role: "user", parts: [{ type: "text", text }] }],
});

describe("POST /api/ask", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    model = streamingModel(["I'm Carlos's ", "AI double."]);
    ({ POST } = await import("./route"));
  });

  it("streams an answer grounded in the public brief and retrieved pages", async () => {
    const res = await POST(ask(question("Who are you?")));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("I'm Carlos's ");
    expect(text).toContain("AI double.");

    const call = model.doStreamCalls[0];
    expect(call.maxOutputTokens).toBe(700);
    const system = call.prompt.find((m) => m.role === "system");
    expect(system?.content).toContain("You are an AI double, not Carlos");
    expect(system?.content).toContain("### Life — /projects/life");
    const users = call.prompt.filter((m) => m.role === "user");
    expect(JSON.stringify(users)).toContain("Who are you?");
  });

  it("refuses cross-origin browser requests before calling the model", async () => {
    const res = await POST(
      ask(question("hi"), { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("answers 400 with a readable error for invalid input", async () => {
    const bad = await POST(ask("{not json"));
    expect(bad.status).toBe(400);
    const long = await POST(ask(question("x".repeat(2_001))));
    expect(long.status).toBe(400);
    expect(await long.json()).toEqual({
      error: "Messages are limited to 2000 characters.",
    });
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("rate-limits one client with Retry-After and leaves others alone", async () => {
    const ip = { "x-forwarded-for": "198.51.100.9" };
    for (let i = 0; i < 8; i++) {
      const ok = await POST(ask(question(`q${i}`), ip));
      expect(ok.status).toBe(200);
      await ok.text();
      model = streamingModel(["ok"]);
    }
    const limited = await POST(ask(question("one more"), ip));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);

    const other = await POST(ask(question("hello"), { "x-forwarded-for": "198.51.100.10" }));
    expect(other.status).toBe(200);
  });
});
