import { ANONYMOUS_LIMITS, type AnonymousSession } from "./types/anonymous";
import { generateUUID } from "./utils";

export function createAnonymousSession(): AnonymousSession {
  return {
    id: generateUUID(),
    remainingCredits: ANONYMOUS_LIMITS.CREDITS,
    createdAt: new Date(),
  };
}
