// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "@/lib/twin/guard";
import { AskTwin, SEND_WINDOW } from "./ask-twin";

// The visitor flows of the "Ask Carlos" double (BRO-3994), driven through
// the real useChat + DefaultChatTransport stack against a stubbed /api/ask.

/** A UI-message stream, as POST /api/ask returns it. */
function sse(parts: object[]) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      for (const p of parts)
        c.enqueue(enc.encode(`data: ${JSON.stringify(p)}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

function answer(markdown: string) {
  return sse([
    { type: "start" },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: markdown },
    { type: "text-end", id: "t" },
    { type: "finish" },
  ]);
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no layout; the log auto-scroll only needs the property.
  Element.prototype.scrollTo ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AskTwin", () => {
  it("asks a suggestion and renders the markdown answer with in-site links", async () => {
    fetchMock.mockResolvedValueOnce(
      answer("I'm Carlos's **AI double**. See [my profile](/profile)."),
    );
    render(<AskTwin />);

    fireEvent.click(screen.getByRole("button", { name: "Who are you?" }));

    const link = await screen.findByRole("link", { name: "my profile" });
    expect(link.getAttribute("href")).toBe("/profile");
    expect(link.getAttribute("target")).toBeNull();
    expect(screen.getByText("AI double").tagName).toBe("STRONG");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/ask");
    expect(String(init?.body)).toContain("Who are you?");
  });

  it("shows the route's own wording for a refused request (429)", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error:
            "You're asking faster than I can answer. Try again in a minute.",
        },
        { status: 429 },
      ),
    );
    render(<AskTwin />);
    fireEvent.click(screen.getByRole("button", { name: "Who are you?" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You're asking faster than I can answer. Try again in a minute.",
    );
  });

  it("shows the route's fallback when the model stream fails", async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        { type: "start" },
        {
          type: "error",
          errorText:
            "I couldn't answer that just now. Please try again, or write to carlos@broomva.tech.",
        },
      ]),
    );
    render(<AskTwin />);
    fireEvent.click(screen.getByRole("button", { name: "Who are you?" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "I couldn't answer that just now",
    );
  });

  it("hides raw network errors behind a generic line", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<AskTwin />);
    fireEvent.click(screen.getByRole("button", { name: "Who are you?" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Something went wrong. Try again, or write to carlos@broomva.tech.",
    );
  });

  it("starts over with New conversation", async () => {
    fetchMock.mockResolvedValueOnce(answer("Hello from the double."));
    render(<AskTwin />);
    fireEvent.click(screen.getByRole("button", { name: "Who are you?" }));
    await screen.findByText("Hello from the double.");

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await waitFor(() => expect(screen.queryByRole("log")).toBeNull());
    expect(screen.getByRole("button", { name: "Who are you?" })).toBeTruthy();
  });

  it("sends a typed question on Enter, not on Shift+Enter", async () => {
    fetchMock.mockResolvedValueOnce(answer("Answer."));
    render(<AskTwin />);
    const box = screen.getByLabelText("Ask Carlos's AI double a question");
    fireEvent.change(box, { target: { value: "What is Lago?" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByText("Answer.");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("What is Lago?");
  });

  // Cross-review round 3: the whole echoed thread could outgrow the body
  // cap in a long, valid conversation. Only the model window is sent.
  it("sends only the last turns, so a long conversation stays under the body cap", async () => {
    const longAnswer = "é".repeat(3_500); // 2-byte UTF-8, ~700 tokens
    for (let i = 0; i < 8; i++) {
      fetchMock.mockImplementationOnce(async () => answer(`${longAnswer}${i}`));
    }
    render(<AskTwin />);
    const box = screen.getByLabelText("Ask Carlos's AI double a question");
    for (let i = 0; i < 8; i++) {
      fireEvent.change(box, { target: { value: `${"q".repeat(1_990)}${i}` } });
      fireEvent.keyDown(box, { key: "Enter" });
      await screen.findByText(`${longAnswer}${i}`);
    }

    const last = fetchMock.mock.calls.at(-1)?.[1]?.body;
    const sent = JSON.parse(String(last)) as { messages: { role: string }[] };
    expect(sent.messages).toHaveLength(SEND_WINDOW); // 15 turns → the last 10
    expect(sent.messages.at(-1)?.role).toBe("user");
    expect(new TextEncoder().encode(String(last)).byteLength).toBeLessThan(
      LIMITS.maxBodyBytes,
    );
  });
});
