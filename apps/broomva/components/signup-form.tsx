"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUpWithEmail } from "@/app/(auth)/register/actions";
import { SocialAuthProviders } from "@/components/social-auth-providers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm({
  className,
  plan,
  ...props
}: React.ComponentProps<typeof Card> & { plan?: string }) {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [authorizedProcessing, setAuthorizedProcessing] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const loginHref = plan ? `/login?plan=${plan}` : "/login";

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card {...props}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>Start with email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-6">
            {plan && <input type="hidden" name="plan" value={plan} />}
            <div className="grid gap-3">
              <Label htmlFor="name">Name</Label>
              <Input
                autoComplete="name"
                id="name"
                name="name"
                placeholder="Carlos"
                required
                type="text"
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="email">Email</Label>
              <Input
                autoComplete="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete="new-password"
                id="password"
                name="password"
                placeholder="Create a password"
                required
                type="password"
              />
            </div>
            {state?.error ? (
              <p className="text-destructive text-sm">{state.error}</p>
            ) : null}
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                checked={acceptedTerms}
                className="mt-1 h-4 w-4"
                name="acceptedTerms"
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                required
                type="checkbox"
              />
              <span>
                I agree to the <Link href="/terms">Terms of Service</Link> and
                acknowledge the <Link href="/privacy">Privacy Policy</Link>.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                checked={authorizedProcessing}
                className="mt-1 h-4 w-4"
                name="authorizedProcessing"
                onChange={(event) =>
                  setAuthorizedProcessing(event.target.checked)
                }
                required
                type="checkbox"
              />
              <span>
                I authorize Broomva to process my account, authentication,
                content, security, and service data for the purposes described
                in the <Link href="/privacy">Privacy Policy</Link>. Optional
                browser analytics are a separate choice.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                checked={ageConfirmed}
                className="mt-1 h-4 w-4"
                name="ageConfirmed"
                onChange={(event) => setAgeConfirmed(event.target.checked)}
                required
                type="checkbox"
              />
              <span>I confirm that I am at least 18 years old.</span>
            </label>
            <Button
              disabled={
                isPending ||
                !acceptedTerms ||
                !authorizedProcessing ||
                !ageConfirmed
              }
              type="submit"
            >
              {isPending ? "Creating account..." : "Create account"}
            </Button>
            <p className="text-xs text-muted-foreground">
              The three confirmations above are also required before social
              signup. After the provider returns, you will confirm again so the
              final receipt can be attached to your account.
            </p>
            <SocialAuthProviders
              disabled={
                !acceptedTerms || !authorizedProcessing || !ageConfirmed
              }
            />
            <div className="text-center text-sm">
              Already have an account?{" "}
              <a className="underline underline-offset-4" href={loginHref}>
                Sign in
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
