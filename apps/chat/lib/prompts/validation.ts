import { z } from "zod";

const promptVariableSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  default: z.string().optional(),
});

const promptLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

export const createPromptSchema = z.object({
  title: z.string().min(1).max(256),
  content: z.string().min(1),
  summary: z.string().nullable().optional(),
  category: z.string().max(128).nullable().optional(),
  model: z.string().max(128).nullable().optional(),
  version: z.string().max(32).nullable().optional().default("1.0"),
  tags: z.array(z.string()).optional().default([]),
  variables: z.array(promptVariableSchema).nullable().optional(),
  links: z.array(promptLinkSchema).nullable().optional(),
  visibility: z.enum(["public", "private"]).optional().default("private"),
});

export const updatePromptSchema = createPromptSchema.partial().extend({
  isHighlighted: z.boolean().optional(),
});

// ─── Telemetry & feedback ────────────────────────────────────────────────

export const createInvocationSchema = z.object({
  id: z.string().uuid().optional(),
  prompt_slug: z.string().min(1).max(256),
  prompt_version: z.string().min(1).max(32),
  source: z.enum(["web", "cli", "skill", "api"]),
  caller: z.string().max(128).optional(),
  session_id: z.string().uuid().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateInvocationInput = z.infer<typeof createInvocationSchema>;

export const updateInvocationSchema = z.object({
  status: z.enum(["completed", "failed", "abandoned"]),
  model: z.string().max(64).optional(),
  latency_ms: z.number().int().min(0).optional(),
  tokens_in: z.number().int().min(0).optional(),
  tokens_out: z.number().int().min(0).optional(),
  error_message: z.string().max(2000).nullable().optional(),
});
export type UpdateInvocationInput = z.infer<typeof updateInvocationSchema>;

export const createFeedbackSchema = z.object({
  invocation_id: z.string().uuid().nullable().optional(),
  prompt_slug: z.string().min(1).max(256),
  prompt_version: z.string().min(1).max(32),
  signal: z.enum(["thumbs_up", "thumbs_down"]),
  text: z.string().max(2000).nullable().optional(),
  source: z.enum(["web", "cli", "skill", "api"]),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
