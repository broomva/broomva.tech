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

// Note: agent-native-architecture does not exist under content/writing/;
// substituted with agentic-control-loop which does exist.
// deep-research-agent exists under content/prompts/ — no substitution needed.
evalite("KG Retrieval Eval", {
  data: async () => [
    {
      input: "Tell me about the agentic control loop essay.",
      expected: { urlSubstring: "/writing/agentic-control-loop" },
    },
    {
      input: "What prompts do you have for deep research?",
      expected: { urlSubstring: "/prompts/deep-research-agent" },
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
      ] as ToolName[],
    });
    return result.finalText;
  },
  scorers: [
    {
      name: "CitesExpectedURL",
      description: "Response must include the expected URL substring.",
      scorer: ({ output, expected }) => {
        const needle = (expected as { urlSubstring: string }).urlSubstring.toLowerCase();
        return output.toLowerCase().includes(needle) ? 1 : 0;
      },
    },
  ],
});
