"use client";

import { useActionState } from "react";
import Link from "next/link";
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
            <SocialAuthProviders />
            <div className="text-center text-sm">
              Don&apos;t have an account?{" "}
              <a className="underline underline-offset-4" href={registerHref}>
                Sign up
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
