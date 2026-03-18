import { tool } from "ai";
import { z } from "zod";
import {
  createUserPrompt,
  deleteUserPrompt,
  getUserPromptById,
  getVisiblePrompts,
  updateUserPrompt,
} from "@/lib/db/queries";
import type { ToolSession } from "./types";

export function listPromptsTool({ session }: { session: ToolSession }) {
  return tool({
    description:
      "List the user's saved prompt templates. Use when the user asks to see their prompts, find a prompt, or wants to use a saved prompt.",
    inputSchema: z.object({
      search: z
        .string()
        .optional()
        .describe("Search term to filter by title or content"),
    }),
    execute: async ({ search }) => {
      const userId = session.user?.id;
      const prompts = await getVisiblePrompts(userId ?? undefined);
      const filtered = search
        ? prompts.filter(
            (p) =>
              p.title.toLowerCase().includes(search.toLowerCase()) ||
              p.summary?.toLowerCase().includes(search.toLowerCase()) ||
              p.content.toLowerCase().includes(search.toLowerCase()),
          )
        : prompts;
      return filtered.map((p) => ({
        id: p.id,
        title: p.title,
        summary: p.summary,
        category: p.category,
        tags: p.tags,
      }));
    },
  });
}

export function getPromptTool() {
  return tool({
    description:
      "Get the full content of a saved prompt template by ID. Use after listing prompts to retrieve the actual prompt text.",
    inputSchema: z.object({
      id: z.string().describe("The prompt template ID"),
    }),
    execute: async ({ id }) => {
      const prompt = await getUserPromptById(id);
      if (!prompt) return { error: "Prompt not found" };
      return {
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        summary: prompt.summary,
        category: prompt.category,
        tags: prompt.tags,
        variables: prompt.variables,
      };
    },
  });
}

export function savePromptTool({ session }: { session: ToolSession }) {
  return tool({
    description:
      "Save a new prompt template or update an existing one. Use when the user wants to save a prompt for reuse.",
    inputSchema: z.object({
      id: z
        .string()
        .optional()
        .describe("If updating an existing prompt, pass its ID"),
      title: z.string().describe("Short descriptive title for the prompt"),
      content: z.string().describe("The full prompt text"),
      summary: z
        .string()
        .optional()
        .describe("Brief description of what this prompt does"),
      category: z.string().optional().describe("Category for the prompt"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorizing the prompt"),
    }),
    execute: async ({ id, title, content, summary, category, tags }) => {
      const userId = session.user?.id;
      if (!userId) return { error: "Must be logged in to save prompts" };

      if (id) {
        const updated = await updateUserPrompt(id, userId, {
          title,
          content,
          summary: summary ?? null,
          category: category ?? null,
          tags: tags ?? [],
        });
        if (!updated) return { error: "Prompt not found or not owned by you" };
        return { id: updated.id, title: updated.title, saved: true };
      }
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 200);
      const created = await createUserPrompt({
        userId,
        slug: `${slug}-${Date.now()}`,
        title,
        content,
        summary: summary ?? null,
        category: category ?? null,
        model: null,
        version: null,
        tags: tags ?? [],
        variables: null,
        links: null,
        visibility: "private",
        deletedAt: null,
      });
      return { id: created.id, title: created.title, saved: true };
    },
  });
}

export function deletePromptTool({ session }: { session: ToolSession }) {
  return tool({
    description: "Delete a saved prompt template by ID.",
    inputSchema: z.object({
      id: z.string().describe("The prompt template ID to delete"),
    }),
    execute: async ({ id }) => {
      const userId = session.user?.id;
      if (!userId) return { error: "Must be logged in to delete prompts" };
      const deleted = await deleteUserPrompt(id, userId);
      return { deleted };
    },
  });
}
