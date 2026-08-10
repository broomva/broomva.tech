import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSafeSession } from "@/lib/auth";
import { hasCurrentLegalAcceptance } from "@/lib/db/legal-acceptance";
import { acceptCurrentLegalTerms } from "./actions";

export default async function LegalAcceptancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) redirect("/register");
  if (await hasCurrentLegalAcceptance(session.user.id)) redirect("/chat");

  const { error } = await searchParams;

  return (
    <main className="container mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Review before continuing</CardTitle>
          <CardDescription>
            Your account does not have a record for the current legal versions.
            Confirm them before using the Service.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={acceptCurrentLegalTerms} className="grid gap-5">
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-1 h-4 w-4"
                name="acceptedTerms"
                required
                type="checkbox"
              />
              <span>
                I agree to the <Link href="/terms">Terms of Service</Link> and
                acknowledge the <Link href="/privacy">Privacy Policy</Link>.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-1 h-4 w-4"
                name="authorizedProcessing"
                required
                type="checkbox"
              />
              <span>
                I authorize Broomva to process my account, authentication,
                content, security, and service data for the purposes described
                in the Privacy Policy. Optional browser analytics are separate.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-1 h-4 w-4"
                name="ageConfirmed"
                required
                type="checkbox"
              />
              <span>I confirm that I am at least 18 years old.</span>
            </label>
            {error === "required" ? (
              <p className="text-destructive text-sm">
                All confirmations are required.
              </p>
            ) : null}
            <Button type="submit">Accept and continue</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
