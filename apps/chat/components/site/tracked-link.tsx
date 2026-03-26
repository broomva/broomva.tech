"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import type { ReactNode } from "react";

interface TrackedLinkProps {
  href: string;
  label: string;
  linkType: "hero" | "quick_action" | "content" | "profile" | "deployment";
  internal?: boolean;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
}

export function TrackedLink({
  href,
  label,
  linkType,
  internal,
  className,
  children,
  target,
  rel,
}: TrackedLinkProps) {
  const posthog = usePostHog();

  const handleClick = () => {
    // Read stored UTM params for attribution
    let utmProps: Record<string, string | null> = {};
    try {
      const raw = localStorage.getItem("broomva_utm");
      if (raw) {
        const data = JSON.parse(raw);
        utmProps = {
          utm_source: data.utm_source,
          utm_medium: data.utm_medium,
          utm_campaign: data.utm_campaign,
          utm_content: data.utm_content,
        };
      }
    } catch {
      // ignore
    }

    posthog?.capture("link_clicked", {
      label,
      destination: href,
      link_type: linkType,
      page: "links",
      ...utmProps,
    });
  };

  if (internal) {
    return (
      <Link
        href={href as Route}
        className={className}
        onClick={handleClick}
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target={target ?? "_blank"}
      rel={rel ?? "noopener noreferrer"}
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
