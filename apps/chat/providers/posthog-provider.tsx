"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://t.broomva.tech";

if (typeof window !== "undefined" && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false, // we handle this manually for UTM enrichment
    capture_pageleave: true,
  });
}

// Fires $pageview on every pathname change — no useSearchParams, no Suspense needed
function PostHogPageView() {
  const pathname = usePathname();
  const lastPathname = useRef("");

  useEffect(() => {
    if (!pathname || pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    posthog.capture("$pageview", {
      $current_url: typeof window !== "undefined" ? window.location.href : pathname,
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
  if (!POSTHOG_KEY) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      <Suspense fallback={null}>
        <UTMTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
