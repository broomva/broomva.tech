import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { evalite } from "evalite";
import { wrapAISDKModel } from "evalite/ai-sdk";

evalite("Test Capitals", {
  data: async () => [
    {
      input: `What's the capital of France?`,
      expected: "Paris",
    },
    {
      input: `What's the capital of Germany?`,
      expected: "Berlin",
    },
  ],
  task: async (input) => {
    const result = streamText({
      model: wrapAISDKModel(openai("gpt-4o-mini") as any),
      system: "Answer the question concisely.",
      prompt: input,
    });

    // All calls are automatically traced
    return await result.output;
  },
  scorers: [
    {
      name: "Contains Paris",
      description: "Checks if the output contains the word 'Paris'.",
      scorer: ({ output, expected }) => (output.includes(expected) ? 1 : 0),
    },
  ],
});
