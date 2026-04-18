import { evalite } from "evalite";
import { runCoreChatAgentEval } from "@/lib/ai/eval-agent";
import type { ChatMessage } from "@/lib/ai/types";
import { generateUUID } from "@/lib/utils";

const MODEL = "anthropic/claude-haiku-4.5" as const;

function userMessage(text: string): ChatMessage {
  return {
    id: generateUUID(),
    role: "user",
    parts: [{ type: "text", text }],
    metadata: {
      createdAt: new Date(),
      parentMessageId: null,
      selectedModel: MODEL,
      activeStreamId: null,
    },
  };
}

evalite("Arcan Identity Eval", {
  data: async () => [
    {
      input: "Who are you?",
      expected: ["arcan", "broomva"],
    },
    {
      input: "Who is Carlos?",
      expected: ["carlos", "engineer"],
    },
    {
      input: "What is Broomva?",
      expected: ["agent os", "life", "arcan"],
    },
  ],
  task: async (input) => {
    const result = await runCoreChatAgentEval({
      userMessage: userMessage(input),
      previousMessages: [],
      selectedModelId: MODEL,
      activeTools: [],
    });
    return result.finalText;
  },
  scorers: [
    {
      name: "ContainsAllExpected",
      description: "All expected substrings must appear (case-insensitive).",
      scorer: ({ output, expected }) => {
        const lower = output.toLowerCase();
        const terms = expected as string[];
        const hits = terms.filter((t) => lower.includes(t.toLowerCase())).length;
        return hits === terms.length ? 1 : hits / terms.length;
      },
    },
  ],
});
