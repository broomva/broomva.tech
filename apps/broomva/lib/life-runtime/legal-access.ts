import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { hasCurrentLegalAcceptance } from "@/lib/db/legal-acceptance";
import type { ConsumerIdentity } from "@/lib/life-runtime/types";

export async function resolveAcceptedLifeConsumer(): Promise<ConsumerIdentity | null> {
  const hdrs = await headers();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: hdrs },
  });
  if (!session?.user?.id) return null;
  if (!(await hasCurrentLegalAcceptance(session.user.id))) return null;
  return { kind: "user", id: session.user.id };
}

export async function callerOwnsLifeSession(session: {
  consumerKind: "user" | "anon" | "agent";
  consumerId: string;
}): Promise<boolean> {
  const hdrs = await headers();

  if (session.consumerKind === "user") {
    const { data: authed } = await getSafeSession({
      fetchOptions: { headers: hdrs },
    });
    return (
      authed?.user?.id === session.consumerId &&
      (await hasCurrentLegalAcceptance(session.consumerId))
    );
  }

  // Legacy anonymous cookies were unsigned/client-editable, and legacy
  // agent/x402 sessions were not bound to cryptographic caller proof. Neither
  // is ownership evidence, so every non-user legacy session fails closed.
  return false;
}
