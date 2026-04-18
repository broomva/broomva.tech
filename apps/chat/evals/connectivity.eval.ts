import { evalite } from "evalite";
import { runCoreChatAgentEval } from "@/lib/ai/eval-agent";
import type { ChatMessage, ToolName } from "@/lib/ai/types";
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

evalite("KG Connectivity Eval", {
  data: async () => [
    {
      input: "Show me everything in our knowledge graph tagged agent-os.",
      expected: { minLinkCount: 2, mustContain: "/" },
    },
    {
      input: "What's connected to the Life Agent OS project?",
      expected: { minLinkCount: 2, mustContain: "/" },
    },
  ],
  task: async (input) => {
    const result = await runCoreChatAgentEval({
      userMessage: userMessage(input),
      previousMessages: [],
      selectedModelId: MODEL,
      activeTools: [
        "searchKnowledge",
        "readKnowledgeNote",
        "traverseKnowledge",
      ] as ToolName[],
    });
    return result.finalText;
  },
  scorers: [
    {
      name: "HasEnoughLinks",
      description: "Response must include at least minLinkCount markdown links.",
      scorer: ({ output, expected }) => {
        const exp = expected as { minLinkCount: number; mustContain: string };
        const links = [...output.matchAll(/\]\((\/[^)]+)\)/g)].map((m) => m[1]);
        const ok =
          links.length >= exp.minLinkCount &&
          links.some((l) => l.includes(exp.mustContain));
        return ok ? 1 : 0;
      },
    },
  ],
});
