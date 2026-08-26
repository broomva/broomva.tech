import "server-only";
import { redirect } from "next/navigation";
import { hasCurrentLegalAcceptance } from "./db/legal-acceptance";

export async function requireCurrentLegalAcceptance(userId: string) {
  if (!(await hasCurrentLegalAcceptance(userId))) {
    redirect("/legal-acceptance");
  }
}
