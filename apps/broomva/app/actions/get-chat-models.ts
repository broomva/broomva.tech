"use server";

import { fetchChatModels } from "@/lib/ai/app-models";

export async function getChatModels() {
  return await fetchChatModels();
}
