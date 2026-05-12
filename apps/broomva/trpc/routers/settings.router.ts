import { z } from "zod";
import {
  deleteAudioPlaybackState,
  getAudioPlaybackState,
  getUserModelPreferences,
  upsertAudioPlaybackState,
  upsertUserModelPreference,
} from "@/lib/db/queries";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const settingsRouter = createTRPCRouter({
  getModelPreferences: protectedProcedure.query(
    async ({ ctx }) => await getUserModelPreferences({ userId: ctx.user.id })
  ),

  setModelEnabled: protectedProcedure
    .input(
      z.object({
        modelId: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertUserModelPreference({
        userId: ctx.user.id,
        modelId: input.modelId,
        enabled: input.enabled,
      });
      return { success: true };
    }),

  getAudioPlayback: protectedProcedure.query(
    async ({ ctx }) => await getAudioPlaybackState({ userId: ctx.user.id })
  ),

  upsertAudioPlayback: protectedProcedure
    .input(
      z.object({
        audioSrc: z.string(),
        slug: z.string(),
        title: z.string(),
        currentTime: z.number(),
        duration: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertAudioPlaybackState({
        userId: ctx.user.id,
        ...input,
      });
      return { success: true };
    }),

  clearAudioPlayback: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteAudioPlaybackState({ userId: ctx.user.id });
    return { success: true };
  }),
});
