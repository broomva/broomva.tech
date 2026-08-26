"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signInWithEmail } from "@/app/(auth)/login/actions";
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
import { cn } from "@/lib/utils";

export function LoginForm({
  className,
  plan,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { plan?: string }) {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);
  const [socialTerms, setSocialTerms] = useState(false);
  const [socialProcessing, setSocialProcessing] = useState(false);
  const [socialAge, setSocialAge] = useState(false);

  const registerHref = plan ? `/register?plan=${plan}` : "/register";

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in with your email and password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-6">
            {plan && <input type="hidden" name="plan" value={plan} />}
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
                autoComplete="current-password"
                id="password"
                name="password"
                placeholder="Enter your password"
                required
                type="password"
              />
            </div>
            {state?.error ? (
              <p className="text-destructive text-sm">{state.error}</p>
            ) : null}
            <Button disabled={isPending} type="submit">
              {isPending ? "Signing in..." : "Sign in"}
            </Button>
            <div className="grid gap-3 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Social providers may create an account if none exists. Confirm
                these before social sign-in; the post-provider page records the
                authoritative receipt.
              </p>
              <label className="flex items-start gap-2 text-xs">
                <input
                  checked={socialTerms}
                  className="mt-0.5"
                  onChange={(event) => setSocialTerms(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I agree to the <Link href="/terms">Terms</Link> and
                  acknowledge the <Link href="/privacy">Privacy Policy</Link>.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs">
                <input
                  checked={socialProcessing}
                  className="mt-0.5"
                  onChange={(event) =>
                    setSocialProcessing(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I authorize the account, authentication, and service-data
                  processing described in the Privacy Policy.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs">
                <input
                  checked={socialAge}
                  className="mt-0.5"
                  onChange={(event) => setSocialAge(event.target.checked)}
                  type="checkbox"
                />
                <span>I confirm that I am at least 18 years old.</span>
              </label>
            </div>
            <SocialAuthProviders
              disabled={!socialTerms || !socialProcessing || !socialAge}
            />
            <div className="text-center text-sm">
              Don&apos;t have an account?{" "}
              <a className="underline underline-offset-4" href={registerHref}>
                Sign up
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
