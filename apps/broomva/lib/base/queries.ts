import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { baseAccount, baseAuthNonce } from "@/lib/db/schema";

const MISSING_TABLE = "42P01";

export function isMissingTable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === MISSING_TABLE
  );
}

export type NonceValidation =
  | { ok: true }
  | { ok: false; reason: "missing" | "wrong_user" | "used" | "expired" };

export function validateNonceRow(
  row: { userId: string; usedAt: Date | null; expiresAt: Date } | undefined,
  expectedUserId: string,
  now: Date,
): NonceValidation {
  if (!row) {
    return { ok: false, reason: "missing" };
  }
  if (row.userId !== expectedUserId) {
    return { ok: false, reason: "wrong_user" };
  }
  if (row.usedAt !== null) {
    return { ok: false, reason: "used" };
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export async function getBaseAccountLink(userId: string): Promise<{
  address: string;
  chainId: number;
  verifiedAt: Date;
} | null> {
  try {
    const rows = await db
      .select({
        address: baseAccount.address,
        chainId: baseAccount.chainId,
        verifiedAt: baseAccount.verifiedAt,
      })
      .from(baseAccount)
      .where(eq(baseAccount.userId, userId))
      .limit(1);

    return rows[0] ?? null;
  } catch (error) {
    if (isMissingTable(error)) {
      return null;
    }
    throw error;
  }
}

export async function getNonceRow(nonce: string): Promise<
  | {
      userId: string;
      usedAt: Date | null;
      expiresAt: Date;
    }
  | undefined
> {
  const rows = await db
    .select({
      userId: baseAuthNonce.userId,
      usedAt: baseAuthNonce.usedAt,
      expiresAt: baseAuthNonce.expiresAt,
    })
    .from(baseAuthNonce)
    .where(eq(baseAuthNonce.nonce, nonce))
    .limit(1);

  return rows[0];
}

export async function insertNonce({
  nonce,
  userId,
  expiresAt,
}: {
  nonce: string;
  userId: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(baseAuthNonce).values({
    nonce,
    userId,
    expiresAt,
  });
}

export async function markNonceUsed(
  nonce: string,
  usedAt: Date,
): Promise<void> {
  await db
    .update(baseAuthNonce)
    .set({ usedAt })
    .where(eq(baseAuthNonce.nonce, nonce));
}

export async function upsertBaseAccount({
  id,
  userId,
  address,
  chainId,
  verifiedAt,
}: {
  id: string;
  userId: string;
  address: string;
  chainId: number;
  verifiedAt: Date;
}): Promise<void> {
  await db.delete(baseAccount).where(eq(baseAccount.userId, userId));
  await db.insert(baseAccount).values({
    id,
    userId,
    address,
    chainId,
    verifiedAt,
  });
}

export async function deleteBaseAccount(userId: string): Promise<void> {
  await db.delete(baseAccount).where(eq(baseAccount.userId, userId));
}
