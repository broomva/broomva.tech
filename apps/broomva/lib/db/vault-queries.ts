/**
 * UserVault database queries — maps authenticated users to Lago sessions.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userVault } from "@/lib/db/schema";

/** Get the primary vault for a user. */
export async function getUserPrimaryVault(userId: string) {
  const [vault] = await db
    .select()
    .from(userVault)
    .where(eq(userVault.userId, userId))
    .limit(1);

  return vault ?? null;
}

/** Create a vault mapping for a user. */
export async function createUserVault(params: {
  userId: string;
  lagoSessionId: string;
  name?: string;
}) {
  const [vault] = await db
    .insert(userVault)
    .values({
      userId: params.userId,
      lagoSessionId: params.lagoSessionId,
      name: params.name ?? "default",
      isPrimary: true,
    })
    .returning();

  return vault;
}

/** Get or create a vault for a user (idempotent). */
export async function getOrCreateUserVault(params: {
  userId: string;
  lagoSessionId: string;
}) {
  const existing = await getUserPrimaryVault(params.userId);
  if (existing) return existing;
  return createUserVault(params);
}
