import { z } from "zod";

// Provider metadata schema - using unknown since we don't have a specific schema
const providerMetadataSchema = z.unknown().optional();

/**
 * Zod validators for each UI message part type
 * Used to validate parts before mapping to database Part rows
 */

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  state: z.enum(["streaming", "done"]).optional(),
  providerMetadata: providerMetadataSchema,
});

const reasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
  state: z.enum(["streaming", "done"]).optional(),
  providerMetadata: providerMetadataSchema,
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string(),
  filename: z.string().optional(),
  url: z.string(),
  providerMetadata: providerMetadataSchema,
});

const sourceUrlPartSchema = z.object({
  type: z.literal("source-url"),
  sourceId: z.string(),
  url: z.string(),
  title: z.string().optional(),
  providerMetadata: providerMetadataSchema,
});

const sourceDocumentPartSchema = z.object({
  type: z.literal("source-document"),
  sourceId: z.string(),
  mediaType: z.string(),
  title: z.string(),
  filename: z.string().optional(),
  providerMetadata: providerMetadataSchema,
});

const stepStartPartSchema = z.object({
  type: z.literal("step-start"),
});

const dataPartSchema = z.object({
  type: z.string().startsWith("data-"),
  id: z.string().optional(),
  data: z.unknown(),
});

// Tool part schemas for different states
const toolPartInputStreamingSchema = z.object({
  type: z.string().startsWith("tool-"),
  toolCallId: z.string(),
  state: z.literal("input-streaming"),
  providerExecuted: z.boolean().optional(),
  input: z.unknown().optional(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  approval: z.never().optional(),
});

const toolPartInputAvailableSchema = z.object({
  type: z.string().startsWith("tool-"),
  toolCallId: z.string(),
  state: z.literal("input-available"),
  providerExecuted: z.boolean().optional(),
  input: z.unknown(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  approval: z.never().optional(),
});

const toolPartApprovalRequestedSchema = z.object({
  type: z.string().startsWith("tool-"),
  toolCallId: z.string(),
  state: z.literal("approval-requested"),
  input: z.unknown(),
  providerExecuted: z.boolean().optional(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  approval: z.object({
    id: z.string(),
    approved: z.never().optional(),
    reason: z.never().optional(),
  }),
});

const toolPartApprovalRespondedSchema = z.object({
  type: z.string().startsWith("tool-"),
  toolCallId: z.string(),
  state: z.literal("approval-responded"),
  input: z.unknown(),
  providerExecuted: z.boolean().optional(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  approval: z.object({
    id: z.string(),
    approved: z.boolean(),
    reason: z.string().optional(),
  }),
});

const toolPartOutputAvailableSchema = z.object({
  type: z.string().startsWith("tool-"),
  toolCallId: z.string(),
  state: z.literal("output-available"),
  providerExecuted: z.boolean().optional(),
  input: z.unknown(),
  output: z.unknown(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  preliminary: z.boolean().optional(),
  approval: z
    .object({
      id: z.string(),
      approved: z.literal(true),
      reason: z.string().optional(),
    })
    .optional(),
});

const toolPartOutputErrorSchema = z.object({
  type: z.string().startsWith("tool-"),
  toolCallId: z.string(),
  state: z.literal("output-error"),
  providerExecuted: z.boolean().optional(),
  input: z.unknown(),
  output: z.never().optional(),
  errorText: z.string(),
  callProviderMetadata: providerMetadataSchema,
  approval: z
    .object({
      id: z.string(),
      approved: z.literal(true),
      reason: z.string().optional(),
    })
    .optional(),
});

const toolPartOutputDeniedSchema = z.object({
  type: z.string().startsWith("tool-"),
  toolCallId: z.string(),
  state: z.literal("output-denied"),
  providerExecuted: z.boolean().optional(),
  input: z.unknown(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  approval: z.object({
    id: z.string(),
    approved: z.literal(false),
    reason: z.string().optional(),
  }),
});

// Union schema for all tool part states
const toolPartSchema = z.union([
  toolPartInputStreamingSchema,
  toolPartInputAvailableSchema,
  toolPartApprovalRequestedSchema,
  toolPartApprovalRespondedSchema,
  toolPartOutputAvailableSchema,
  toolPartOutputErrorSchema,
  toolPartOutputDeniedSchema,
]);

// Dynamic tool part schemas
const dynamicToolPartInputStreamingSchema = z.object({
  type: z.literal("dynamic-tool"),
  toolName: z.string(),
  toolCallId: z.string(),
  title: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  state: z.literal("input-streaming"),
  input: z.unknown().optional(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  approval: z.never().optional(),
});

const dynamicToolPartInputAvailableSchema = z.object({
  type: z.literal("dynamic-tool"),
  toolName: z.string(),
  toolCallId: z.string(),
  title: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  state: z.literal("input-available"),
  input: z.unknown(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  approval: z.never().optional(),
});

const dynamicToolPartApprovalRequestedSchema = z.object({
  type: z.literal("dynamic-tool"),
  toolName: z.string(),
  toolCallId: z.string(),
  title: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  state: z.literal("approval-requested"),
  input: z.unknown(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  approval: z.object({
    id: z.string(),
    approved: z.never().optional(),
    reason: z.never().optional(),
  }),
});

const dynamicToolPartApprovalRespondedSchema = z.object({
  type: z.literal("dynamic-tool"),
  toolName: z.string(),
  toolCallId: z.string(),
  title: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  state: z.literal("approval-responded"),
  input: z.unknown(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  approval: z.object({
    id: z.string(),
    approved: z.boolean(),
    reason: z.string().optional(),
  }),
});

const dynamicToolPartOutputAvailableSchema = z.object({
  type: z.literal("dynamic-tool"),
  toolName: z.string(),
  toolCallId: z.string(),
  title: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  state: z.literal("output-available"),
  input: z.unknown(),
  output: z.unknown(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  preliminary: z.boolean().optional(),
  approval: z
    .object({
      id: z.string(),
      approved: z.literal(true),
      reason: z.string().optional(),
    })
    .optional(),
});

const dynamicToolPartOutputErrorSchema = z.object({
  type: z.literal("dynamic-tool"),
  toolName: z.string(),
  toolCallId: z.string(),
  title: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  state: z.literal("output-error"),
  input: z.unknown(),
  output: z.never().optional(),
  errorText: z.string(),
  callProviderMetadata: providerMetadataSchema,
  approval: z
    .object({
      id: z.string(),
      approved: z.literal(true),
      reason: z.string().optional(),
    })
    .optional(),
});

const dynamicToolPartOutputDeniedSchema = z.object({
  type: z.literal("dynamic-tool"),
  toolName: z.string(),
  toolCallId: z.string(),
  title: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  state: z.literal("output-denied"),
  input: z.unknown(),
  output: z.never().optional(),
  errorText: z.never().optional(),
  callProviderMetadata: providerMetadataSchema,
  approval: z.object({
    id: z.string(),
    approved: z.literal(false),
    reason: z.string().optional(),
  }),
});

// Union schema for all dynamic tool part states
const dynamicToolPartSchema = z.union([
  dynamicToolPartInputStreamingSchema,
  dynamicToolPartInputAvailableSchema,
  dynamicToolPartApprovalRequestedSchema,
  dynamicToolPartApprovalRespondedSchema,
  dynamicToolPartOutputAvailableSchema,
  dynamicToolPartOutputErrorSchema,
  dynamicToolPartOutputDeniedSchema,
]);

// Union schema for all part types
const _messagePartSchema = z.union([
  textPartSchema,
  reasoningPartSchema,
  filePartSchema,
  sourceUrlPartSchema,
  sourceDocumentPartSchema,
  stepStartPartSchema,
  dataPartSchema,
  toolPartSchema,
  dynamicToolPartSchema,
]);

/**
 * Validates a tool part and returns the result
 * Returns result with success flag - if validation fails, the part should be skipped
 */
export function validateToolPart(part: unknown) {
  return toolPartSchema.safeParse(part);
}

/**
 * Validates a dynamic tool part and returns the result
 * Returns result with success flag - if validation fails, the part should be skipped
 */
export function validateDynamicToolPart(part: unknown) {
  return dynamicToolPartSchema.safeParse(part);
}
