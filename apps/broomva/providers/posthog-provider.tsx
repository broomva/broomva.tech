"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  parseAnalyticsConsent,
  resolveAnalyticsConsent,
  serializeAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics-consent";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://t.broomva.tech";
const ANALYTICS_CONSENT_COOKIE_KEY = "broomva_analytics_consent";

let posthogInitialized = false;

function readConsentCookie(): AnalyticsConsent {
  try {
    const value = document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${ANALYTICS_CONSENT_COOKIE_KEY}=`))
      ?.split("=")[1];
    return parseAnalyticsConsent(value ? decodeURIComponent(value) : null);
  } catch {
    return "unknown";
  }
}

function writeConsentCookie(
  consent: Exclude<AnalyticsConsent, "unknown">,
): boolean {
  try {
    document.cookie = `${ANALYTICS_CONSENT_COOKIE_KEY}=${encodeURIComponent(
      serializeAnalyticsConsent(consent),
    )}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
    return readConsentCookie() === consent;
  } catch {
    return false;
  }
}

function initPostHog(): void {
  if (posthogInitialized || !POSTHOG_KEY) return;
  posthogInitialized = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    opt_out_capturing_by_default: true,
    capture_pageview: false, // we handle this manually for UTM enrichment
    capture_pageleave: true,
  });
}

function clearLegacyPostHogStorage(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("ph_") || key.toLowerCase().includes("posthog")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable in hardened browsers.
  }

  try {
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name?.startsWith("ph_")) {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      }
    }
  } catch {
    // Cookie access can be unavailable; optional analytics remains default-off.
  }
}

// Fires $pageview on every pathname change
function PostHogPageView() {
  const pathname = usePathname();
  const lastPathname = useRef("");

  useEffect(() => {
    if (!pathname || pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    posthog.capture("$pageview", {
      $current_url:
        typeof window !== "undefined" ? window.location.href : pathname,
    });
  }, [pathname]);

  return null;
}

// Persists UTM params to localStorage for cross-page attribution (requires Suspense)
function UTMTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const utmSource = searchParams?.get("utm_source");
    if (!utmSource) return;

    const utmData = {
      utm_source: utmSource,
      utm_medium: searchParams?.get("utm_medium"),
      utm_campaign: searchParams?.get("utm_campaign"),
      utm_content: searchParams?.get("utm_content"),
      landing_page: pathname,
      timestamp: Date.now(),
    };
    localStorage.setItem("broomva_utm", JSON.stringify(utmData));

    posthog.capture("$pageview", {
      $current_url: `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
      utm_source: utmData.utm_source,
      utm_medium: utmData.utm_medium,
      utm_campaign: utmData.utm_campaign,
      utm_content: utmData.utm_content,
    });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<AnalyticsConsent>("unknown");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [consentSaveError, setConsentSaveError] = useState<string | null>(null);

  useEffect(() => {
    const cookieConsent = readConsentCookie();
    let localConsent: AnalyticsConsent = "unknown";
    try {
      localConsent = parseAnalyticsConsent(
        localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY),
      );
    } catch {
      localConsent = "unknown";
    }
    setConsent(resolveAnalyticsConsent(cookieConsent, localConsent));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!POSTHOG_KEY || consent !== "accepted") return;
    const handle = () => {
      initPostHog();
      posthog.opt_in_capturing();
      setReady(true);
    };
    const w = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(handle, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(handle, 1500);
    return () => clearTimeout(t);
  }, [consent]);

  function saveConsent(next: Exclude<AnalyticsConsent, "unknown">) {
    const requiresReload = consent === "accepted" && next === "essential";
    let localPersisted = false;
    try {
      localStorage.setItem(
        ANALYTICS_CONSENT_STORAGE_KEY,
        serializeAnalyticsConsent(next),
      );
      localPersisted = true;
    } catch {
      // Keep the choice for this page without weakening the default-off state.
      try {
        localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
      } catch {
        // The in-memory default-off state still applies for this page.
      }
    }
    const cookiePersisted = writeConsentCookie(next);
    const persisted = localPersisted || cookiePersisted;
    setConsent(next);
    setConsentSaveError(
      persisted
        ? null
        : "Your choice applies to this page, but the browser blocked saving it. Keep this window open or enable site storage before reloading.",
    );
    setPreferencesOpen(!persisted);

    if (next === "essential" && posthogInitialized) {
      posthog.reset();
      posthog.opt_out_capturing();
      setReady(false);
    }
    if (next === "essential") clearLegacyPostHogStorage();
    if (requiresReload && persisted) window.location.reload();
  }

  const showPreferences =
    hydrated && (consent === "unknown" || preferencesOpen);

  return (
    <PHProvider client={posthog}>
      {POSTHOG_KEY && ready && consent === "accepted" ? (
        <>
          <Suspense fallback={null}>
            <PostHogPageView />
          </Suspense>
          <Suspense fallback={null}>
            <UTMTracker />
          </Suspense>
        </>
      ) : null}
      {children}
      {consent === "accepted" ? (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      ) : null}
      {showPreferences ? (
        <section
          aria-label="Analytics preferences"
          className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-2xl rounded-2xl border border-[var(--ag-border-subtle)] bg-bg-dark/95 p-5 shadow-2xl backdrop-blur-xl"
        >
          <h2 className="font-display text-base text-text-primary">
            Your analytics choice
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Essential storage keeps the site, authentication, and your settings
            working. With your permission, we also use browser PostHog and
            Vercel Analytics to measure usage and performance. Optional browser
            analytics stay off unless you accept. Limited identified server-side
            service events continue under the service-data authorization
            described in the Privacy Policy, where applicable; you may object.
            Read the{" "}
            <Link className="underline" href="/privacy#cookies-and-analytics">
              Privacy Policy
            </Link>
            .
          </p>
          {consentSaveError ? (
            <p className="mt-3 text-sm text-amber-300" role="alert">
              {consentSaveError}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              className="rounded-lg border border-[var(--ag-border-subtle)] px-4 py-2 text-sm text-text-primary transition hover:bg-white/5"
              onClick={() => saveConsent("essential")}
              type="button"
            >
              Essential only
            </button>
            <button
              className="rounded-lg bg-ai-blue px-4 py-2 text-sm font-medium text-bg-dark transition hover:opacity-90"
              onClick={() => saveConsent("accepted")}
              type="button"
            >
              Accept analytics
            </button>
          </div>
        </section>
      ) : hydrated ? (
        <button
          className="fixed bottom-3 left-3 z-[90] rounded-full border border-[var(--ag-border-subtle)] bg-bg-dark/90 px-3 py-1.5 text-xs text-text-secondary shadow-lg backdrop-blur transition hover:text-text-primary"
          onClick={() => setPreferencesOpen(true)}
          type="button"
        >
          Cookie choices
        </button>
      ) : null}
    </PHProvider>
  );
}
