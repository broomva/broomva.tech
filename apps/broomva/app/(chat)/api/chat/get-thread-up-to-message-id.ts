import { getAllMessagesByChatId } from "@/lib/db/queries";
import { buildThreadFromLeaf } from "@/lib/thread-utils";

export async function getThreadUpToMessageId(
  chatId: string,
  messageId: string | null
) {
  if (!messageId) {
    return [];
  }

  const messages = await getAllMessagesByChatId({ chatId });

  return buildThreadFromLeaf(messages, messageId);
}
