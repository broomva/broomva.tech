"use client";

import { useActionState } from "react";
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

  const loginHref = plan ? `/login?plan=${plan}` : "/login";

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card {...props}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>
            Start with email and password
          </CardDescription>
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
            <Button disabled={isPending} type="submit">
              {isPending ? "Creating account..." : "Create account"}
            </Button>
            <SocialAuthProviders />
            <div className="text-center text-sm">
              Already have an account?{" "}
              <a className="underline underline-offset-4" href={loginHref}>
                Sign in
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        By clicking continue, you agree to our{" "}
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}
