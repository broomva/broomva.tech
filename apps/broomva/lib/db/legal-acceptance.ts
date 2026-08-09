import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { legalAcceptance } from "./schema";
import {
  PRIVACY_CONTENT_SHA256,
  PRIVACY_VERSION,
  TERMS_CONTENT_SHA256,
  TERMS_VERSION,
} from "../legal";

export type LegalAcceptanceSource = "email-signup" | "legal-acceptance-page";

export async function recordCurrentLegalAcceptance({
  userId,
  source,
  ipAddress,
  userAgent,
}: {
  userId: string;
  source: LegalAcceptanceSource;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await db
    .insert(legalAcceptance)
    .values({
      userId,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      termsHash: TERMS_CONTENT_SHA256,
      privacyHash: PRIVACY_CONTENT_SHA256,
      deploymentId:
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.VERCEL_DEPLOYMENT_ID ??
        null,
      processingAuthorized: true,
      ageConfirmed: true,
      source,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    })
    .onConflictDoNothing({
      target: [
        legalAcceptance.userId,
        legalAcceptance.termsVersion,
        legalAcceptance.privacyVersion,
        legalAcceptance.termsHash,
        legalAcceptance.privacyHash,
        legalAcceptance.source,
      ],
    });
}

export async function hasCurrentLegalAcceptance(userId: string) {
  const [row] = await db
    .select({ id: legalAcceptance.id })
    .from(legalAcceptance)
    .where(
      and(
        eq(legalAcceptance.userId, userId),
        eq(legalAcceptance.termsVersion, TERMS_VERSION),
        eq(legalAcceptance.privacyVersion, PRIVACY_VERSION),
        eq(legalAcceptance.termsHash, TERMS_CONTENT_SHA256),
        eq(legalAcceptance.privacyHash, PRIVACY_CONTENT_SHA256),
        eq(legalAcceptance.processingAuthorized, true),
        eq(legalAcceptance.ageConfirmed, true),
      ),
    )
    .limit(1);

  return Boolean(row);
}
