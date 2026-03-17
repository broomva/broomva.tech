import type { ArtifactKind } from "@/lib/artifacts/artifact-kind";
import type { CostAccumulator } from "@/lib/credits/cost-accumulator";
import type { ModelId } from "../../app-models";
import type { ToolSession } from "../types";

export type DocumentToolResult =
  | {
      status: "success";
      documentId: string;
      result: string;
      date: string;
    }
  | {
      status: "error";
      error: string;
    };

export type DocumentToolContext = {
  session: ToolSession;
  // dataStream: StreamWriter;
  messageId: string;
  selectedModel: ModelId;
  costAccumulator?: CostAccumulator;
};

// Document tool type names as they appear in ChatMessage parts
export const createDocumentToolTypes = [
  "tool-createTextDocument",
  "tool-createCodeDocument",
  "tool-createSheetDocument",
] as const;

export const editDocumentToolTypes = [
  "tool-editTextDocument",
  "tool-editCodeDocument",
  "tool-editSheetDocument",
] as const;

export const documentToolTypes = [
  ...createDocumentToolTypes,
  ...editDocumentToolTypes,
] as const;

export type CreateDocumentToolType = (typeof createDocumentToolTypes)[number];
export type EditDocumentToolType = (typeof editDocumentToolTypes)[number];
export type DocumentToolType = (typeof documentToolTypes)[number];

// Explicit mapping from tool type to artifact kind
const toolTypeToKindMap: Record<DocumentToolType, ArtifactKind> = {
  "tool-createTextDocument": "text",
  "tool-createCodeDocument": "code",
  "tool-createSheetDocument": "sheet",
  "tool-editTextDocument": "text",
  "tool-editCodeDocument": "code",
  "tool-editSheetDocument": "sheet",
};

export function getToolKind(toolType: DocumentToolType): ArtifactKind {
  return toolTypeToKindMap[toolType];
}

export function isEditTool(toolType: DocumentToolType): boolean {
  return (editDocumentToolTypes as readonly string[]).includes(toolType);
}
