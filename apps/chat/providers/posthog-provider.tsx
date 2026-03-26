"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

if (typeof window !== "undefined" && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false, // we handle this manually for UTM enrichment
    capture_pageleave: true,
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = useRef("");

  useEffect(() => {
    if (!pathname) return;

    const url = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
    if (url === lastUrl.current) return;
    lastUrl.current = url;

    const utmSource = searchParams?.get("utm_source");
    const utmMedium = searchParams?.get("utm_medium");
    const utmCampaign = searchParams?.get("utm_campaign");
    const utmContent = searchParams?.get("utm_content");

    // Persist UTMs to localStorage for cross-page attribution
    if (utmSource) {
      const utmData = {
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent,
        landing_page: pathname,
        timestamp: Date.now(),
      };
      localStorage.setItem("broomva_utm", JSON.stringify(utmData));
    }

    const props: Record<string, string | null> = { $current_url: url };
    if (utmSource) props.utm_source = utmSource;
    if (utmMedium) props.utm_medium = utmMedium;
    if (utmCampaign) props.utm_campaign = utmCampaign;
    if (utmContent) props.utm_content = utmContent;

    posthog.capture("$pageview", props);
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!POSTHOG_KEY) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
