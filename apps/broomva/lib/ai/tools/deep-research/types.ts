import type { ModelMessage } from "ai";
import { z } from "zod";
import type { CostAccumulator } from "@/lib/credits/cost-accumulator";
import type { StreamWriter } from "../../types";
import type { DocumentToolResult } from "../documents/types";
import type { DeepResearchRuntimeConfig } from "./configuration";

//##################
// Shared Agent Options
//##################

export type AgentOptions = {
  config: DeepResearchRuntimeConfig;
  dataStream: StreamWriter;
  toolCallId: string;
  messageId: string;
  requestId: string;
  costAccumulator?: CostAccumulator;
  abortSignal?: AbortSignal;
};

//##################
// Telemetry Helper
//##################

export function createTelemetry(
  functionId: string,
  options: Pick<AgentOptions, "messageId" | "requestId">
) {
  return {
    isEnabled: true,
    functionId,
    metadata: {
      messageId: options.messageId,
      langfuseTraceId: options.requestId,
      langfuseUpdateParent: false,
    },
  };
}

//##################
// Structured Outputs (Zod Schemas)
//##################

export const ClarifyWithUserSchema = z.object({
  need_clarification: z
    .boolean()
    .describe("Whether the user needs to be asked a clarifying question."),
  question: z
    .string()
    .describe("A question to ask the user to clarify the report scope"),
  verification: z
    .string()
    .describe(
      "Verify message that we will start research after the user has provided the necessary information."
    ),
});

export const ResearchQuestionSchema = z.object({
  research_brief: z
    .string()
    .describe("A research question that will be used to guide the research."),
  title: z.string().describe("The title of the research report."),
});

//##################
// Pipeline IO
//##################

export type DeepResearchInput = {
  requestId: string;
  messageId: string;
  toolCallId: string;
  messages: ModelMessage[];
};

export type DeepResearchResult =
  | {
      type: "clarifying_question";
      data: string;
    }
  | {
      type: "report";
      data: DocumentToolResult;
    };
