"use server";

import { generateText } from "ai";
import { headers } from "next/headers";
import { getLanguageModel } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/ai/types";
import { getSafeSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { requireCurrentLegalAcceptance } from "@/lib/legal-acceptance-gate";

export async function generateTitleFromUserMessage({
  message,
}: {
  message: ChatMessage;
}) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) throw new Error("Authentication required");
  await requireCurrentLegalAcceptance(session.user.id);

  const { text: title } = await generateText({
    model: await getLanguageModel(config.models.defaults.title),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 40 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
    experimental_telemetry: { isEnabled: true },
  });

  return title;
}
