import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { addExplicitToolRequestToMessages } from "@/app/(chat)/api/chat/add-explicit-tool-request-to-messages";
import { filterPartsForLLM } from "@/app/(chat)/api/chat/filter-reasoning-parts";
import { getRecentGeneratedImage } from "@/app/(chat)/api/chat/get-recent-generated-image";
import { type AppModelId, getAppModelDefinition } from "@/lib/ai/app-models";
import { markdownJoinerTransform } from "@/lib/ai/markdown-joiner-transform";
import { getLanguageModel, getModelProviderOptions } from "@/lib/ai/providers";
import { getAgentAuthSDKTools } from "@/lib/ai/tools/agent-auth-tools";
import { getMcpTools, getTools } from "@/lib/ai/tools/tools";
import type { ChatMessage, StreamWriter, ToolName } from "@/lib/ai/types";
import { config } from "@/lib/config";
import type { CostAccumulator } from "@/lib/credits/cost-accumulator";
import type { McpConnector } from "@/lib/db/schema";
import { replaceFilePartUrlByBinaryDataInMessages } from "@/lib/utils/download-assets";

export async function createCoreChatAgent({
  system,
  userMessage,
  previousMessages,
  selectedModelId,
  explicitlyRequestedTools,
  userId,
  budgetAllowedTools,
  abortSignal,
  messageId,
  chatId,
  dataStream,
  onError,
  onChunk,
  mcpConnectors = [],
  costAccumulator,
}: {
  system: string;
  userMessage: ChatMessage;
  previousMessages: ChatMessage[];
  selectedModelId: AppModelId;
  explicitlyRequestedTools: ToolName[] | null;
  userId: string | null;
  /** Budget-allowed base tools from route.ts (static ToolNames only) */
  budgetAllowedTools: ToolName[];
  abortSignal?: AbortSignal;
  messageId: string;
  chatId: string;
  dataStream: StreamWriter;
  onError?: (error: unknown) => void;
  onChunk?: () => void;
  mcpConnectors?: McpConnector[];
  costAccumulator: CostAccumulator;
}) {
  const modelDefinition = await getAppModelDefinition(selectedModelId);

  // Build message thread
  const messages = [...previousMessages, userMessage].slice(-5);

  // Process conversation history
  const lastGeneratedImage = getRecentGeneratedImage(messages);

  addExplicitToolRequestToMessages(messages, explicitlyRequestedTools);

  // Filter reasoning parts (cross-model compatibility)
  const filteredMessages = filterPartsForLLM(messages.slice(-5));

  // Convert to model messages, ignoring data-* parts (drop them)
  const modelMessages = await convertToModelMessages(filteredMessages, {
    convertDataPart: (_part): undefined => undefined,
  });

  // Replace file URLs with binary data
  const contextForLLM =
    await replaceFilePartUrlByBinaryDataInMessages(modelMessages);

  // Get MCP tools if connectors are configured
  const { tools: mcpTools, cleanup: mcpCleanup } = await getMcpTools({
    connectors: mcpConnectors,
  });

  // Get Agent Auth tools if enabled and user is authenticated
  const { tools: agentAuthTools, cleanup: agentAuthCleanup } =
    config.features.agentAuth && userId
      ? await getAgentAuthSDKTools(userId)
      : { tools: {}, cleanup: () => {} };

  // Get base tools
  const baseTools = getTools({
    dataStream,
    session: {
      user: userId ? { id: userId } : undefined,
    },
    contextForLLM,
    messageId,
    selectedModel: modelDefinition.apiModelId,
    attachments: userMessage.parts.filter((part) => part.type === "file"),
    lastGeneratedImage,
    costAccumulator,
  });

  // Merge base tools with MCP tools and Agent Auth tools
  const allTools = {
    ...baseTools,
    ...mcpTools,
    ...agentAuthTools,
  };

  // Compute final activeTools for streamText:
  // 1. Filter budget-allowed base tools to only those that actually exist in baseTools
  const existingBaseActiveTools = budgetAllowedTools.filter(
    (toolName) => toolName in baseTools
  );
  // 2. Always allow all MCP tools that exist at runtime
  const mcpToolNames = Object.keys(mcpTools);
  // 3. Always allow all Agent Auth tools that exist at runtime
  const agentAuthToolNames = Object.keys(agentAuthTools);
  // 4. Build the final activeTools list (cast needed because dynamic tools are dynamic)
  const activeTools = [
    ...new Set([
      ...existingBaseActiveTools,
      ...mcpToolNames,
      ...agentAuthToolNames,
    ]),
  ] as (keyof typeof allTools)[];

  // Resolve async model config before streamText to ensure cleanup on failure
  let model: Awaited<ReturnType<typeof getLanguageModel>>;
  let providerOptions: Awaited<ReturnType<typeof getModelProviderOptions>>;
  try {
    [model, providerOptions] = await Promise.all([
      getLanguageModel(selectedModelId),
      getModelProviderOptions(selectedModelId),
    ]);
  } catch (error) {
    await mcpCleanup();
    agentAuthCleanup();
    throw error;
  }

  // Create the streamText result
  const result = streamText({
    model,
    system,
    messages: contextForLLM,
    stopWhen: [
      stepCountIs(5),
      ({ steps }) => {
        return steps.some((step) => {
          const toolResults = step.content;
          // Don't stop if the tool result is a clarifying question
          return toolResults.some(
            (toolResult) =>
              toolResult.type === "tool-result" &&
              toolResult.toolName === "deepResearch" &&
              (toolResult.output as { format?: string }).format === "report"
          );
        });
      },
    ],
    activeTools,
    experimental_transform: markdownJoinerTransform(),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "chat-response",
      metadata: {
        userId: userId ?? "anonymous",
        modelId: selectedModelId,
        chatId,
      },
    },
    tools: allTools,
    onError: (error) => {
      onError?.(error);
    },
    onChunk,
    abortSignal,
    providerOptions,
    onFinish: async () => {
      // Clean up MCP clients and Agent Auth client when streaming is done
      await mcpCleanup();
      agentAuthCleanup();
    },
  });

  return {
    result,
    contextForLLM,
    modelDefinition,
    mcpCleanup,
  };
}
