"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";

import {
  createOnboardingOrg,
  skipOnboarding,
} from "@/app/(auth)/onboarding/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Plan catalogue (mirrors pricing page)
// ---------------------------------------------------------------------------

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    credits: "500 credits/mo",
    features: [
      "AI chat with community models",
      "500 AI credits included monthly",
      "Blog and writing access",
      "Basic conversation history",
    ],
    highlighted: false,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$29",
    period: "/month",
    credits: "5,000 credits/mo",
    features: [
      "All AI models (Claude, GPT, Gemini, and more)",
      "5,000 AI credits included monthly",
      "Usage-based overage at $0.01/credit",
      "Console access with usage dashboard",
      "1 API key for programmatic access",
      "Deep research and agent skills",
    ],
    highlighted: true,
  },
  {
    key: "team",
    name: "Team",
    price: "$50",
    period: "/seat/month",
    credits: "20,000 credits/mo",
    features: [
      "Everything in Pro",
      "20,000 AI credits included monthly",
      "Shared workspace and conversations",
      "Up to 10 API keys",
      "Priority model access",
      "Team member management",
    ],
    highlighted: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OnboardingFormProps {
  plan?: string;
  hasExistingOrg: boolean;
  existingOrgId?: string;
  userName: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingForm({
  plan: initialPlan,
  hasExistingOrg,
  existingOrgId,
  userName,
}: OnboardingFormProps) {
  const router = useRouter();

  // Steps: 1 = create org, 2 = select plan
  // If user already has an org, skip to step 2
  const [step, setStep] = useState<1 | 2>(hasExistingOrg ? 2 : 1);
  const [orgId, setOrgId] = useState<string | undefined>(existingOrgId);
  const [selectedPlan, setSelectedPlan] = useState<string>(
    initialPlan ?? "free",
  );
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // --- Org creation action
  const [orgState, orgAction, orgPending] = useActionState(
    createOnboardingOrg,
    null,
  );

  // --- Skip action
  const [, skipAction, skipPending] = useActionState(skipOnboarding, null);

  // When org creation succeeds, advance to step 2
  useEffect(() => {
    if (orgState?.orgId) {
      setOrgId(orgState.orgId);
      setStep(2);
    }
  }, [orgState?.orgId]);

  // Derive slug from org name
  const [orgName, setOrgName] = useState("");
  const derivedSlug = useMemo(
    () =>
      orgName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32),
    [orgName],
  );

  // Handle plan selection + checkout
  async function handleFinish() {
    // Free plan or no org -- redirect to chat
    if (selectedPlan === "free" || !orgId) {
      router.push("/chat");
      return;
    }

    // Paid plan -- POST to Stripe checkout
    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          organizationId: orgId,
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError(data.error ?? "Failed to start checkout.");
        setCheckoutLoading(false);
      }
    } catch {
      setCheckoutError("Network error. Please try again.");
      setCheckoutLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Create Organization
  // -------------------------------------------------------------------------
  if (step === 1) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Create your workspace</CardTitle>
            <CardDescription>
              Set up an organization to manage your team, billing, and API keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={orgAction} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="orgName">Organization name</Label>
                <Input
                  autoFocus
                  id="orgName"
                  name="orgName"
                  placeholder="Acme Labs"
                  required
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="orgSlug">Slug</Label>
                <Input
                  id="orgSlug"
                  name="orgSlug"
                  placeholder="acme-labs"
                  required
                  type="text"
                  value={derivedSlug}
                  readOnly
                  className="bg-muted font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase, 3-32 characters. Used in URLs.
                </p>
              </div>

              {orgState?.error ? (
                <p className="text-destructive text-sm">{orgState.error}</p>
              ) : null}

              <Button
                disabled={orgPending || derivedSlug.length < 3}
                type="submit"
              >
                {orgPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create workspace
                    <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <form action={skipAction}>
              <Button
                variant="ghost"
                type="submit"
                disabled={skipPending}
                className="text-muted-foreground text-sm"
              >
                {skipPending ? "Setting up..." : "Skip for now"}
              </Button>
            </form>
          </CardFooter>
        </Card>

        <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
          By continuing, you agree to our{" "}
          <Link href="/terms">Terms of Service</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Select Plan
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Choose your plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start free, upgrade when you need more.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((p) => {
          const isSelected = selectedPlan === p.key;

          return (
            <Card
              key={p.key}
              className={`cursor-pointer transition-colors ${
                isSelected
                  ? "border-primary ring-2 ring-primary/20"
                  : p.highlighted
                    ? "border-primary/30"
                    : ""
              }`}
              onClick={() => setSelectedPlan(p.key)}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedPlan(p.key);
                }
              }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {isSelected && <Badge variant="default">Selected</Badge>}
                  {p.highlighted && !isSelected && (
                    <Badge variant="secondary">Popular</Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">{p.price}</span>
                  {p.period && (
                    <span className="text-xs text-muted-foreground">
                      {p.period}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{p.credits}</p>
              </CardHeader>
              <CardContent className="pb-3">
                <ul className="space-y-1.5">
                  {p.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-1.5 text-xs"
                    >
                      <CheckIcon className="mt-0.5 size-3 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {checkoutError && (
        <p className="text-destructive text-sm text-center">{checkoutError}</p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={handleFinish}
          disabled={checkoutLoading}
          className="w-full"
        >
          {checkoutLoading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Redirecting...
            </>
          ) : selectedPlan === "free" ? (
            <>
              Continue with Free
              <ArrowRight className="ml-2 size-4" />
            </>
          ) : (
            <>
              Continue with{" "}
              {PLANS.find((p) => p.key === selectedPlan)?.name}
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>

        {selectedPlan !== "free" && (
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedPlan("free");
              router.push("/chat");
            }}
            className="text-muted-foreground text-sm"
          >
            Skip -- start with Free
          </Button>
        )}

        {selectedPlan === "free" && !hasExistingOrg && (
          <Button
            variant="ghost"
            onClick={() => setStep(1)}
            className="text-muted-foreground text-sm"
          >
            Back
          </Button>
        )}
      </div>

      <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        All plans include the open-source agent platform.{" "}
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}
