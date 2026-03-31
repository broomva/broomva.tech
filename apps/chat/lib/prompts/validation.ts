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
