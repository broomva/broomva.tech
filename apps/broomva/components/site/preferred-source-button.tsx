"use client";

import { useTheme } from "next-themes";
import Script from "next/script";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Google's "Add to Preferred Sources" button.
 *
 * A reader who adds broomva.tech as a preferred source sees it ranked with a
 * "preferred" badge in Top Stories, AI Mode and AI Overviews. Google documents
 * this at developers.google.com/search/docs/appearance/preferred-sources.
 *
 * Three details of the upstream library drive the shape of this component, all
 * verified against the shipped bundle rather than inferred from the docs:
 *
 *  1. `init()` selects `[google-add-preferred-source-btn]:not([data-initialized])`
 *     and stamps `data-initialized` on what it finds. There is no
 *     MutationObserver, so a button mounted after the library's own start-up
 *     scan is never rendered. Under client-side navigation this footer can
 *     unmount (see `FOOTER_HIDDEN_PATHS` in conditional-footer.tsx) and mount
 *     again, so we take manual control and re-run `init()` ourselves on mount.
 *     Re-running is safe precisely because of the `:not([data-initialized])`
 *     filter — already-rendered buttons are skipped.
 *
 *  2. After the library loads it replaces the `PREFERRED_SOURCE` array with
 *     `{ push: (...fns) => fns.forEach((fn) => fn(api)) }`, so the same
 *     `push(callback)` call works whether we run before or after load. That is
 *     why this effect needs no readiness handshake of its own.
 *
 *  3. The theme is passed through `init()` rather than the documented
 *     `data-theme` attribute on purpose. `globals.css` defines the palette
 *     under a bare `[data-theme="dark"]` selector, which matches any element —
 *     putting Google's attribute on this div would silently re-scope the
 *     site's design tokens for the subtree.
 *
 * The theme is read once, when it first resolves. The library styles the button
 * at init and offers no restyle hook, so toggling the site theme afterwards
 * leaves the button in the theme it was built with until the next mount.
 */

type PreferredSourceApi = {
  init: (options: { theme?: "light" | "dark"; lang?: string }) => void;
  addPreferredSource: () => void;
};

type PreferredSourceCallback = (api: PreferredSourceApi) => void;

declare global {
  // Before the library loads this is a plain array we create; afterwards the
  // library swaps in an object exposing the same `push`. Typing it as the array
  // covers the only member this component touches.
  var PREFERRED_SOURCE: Array<PreferredSourceCallback> | undefined;
}

export function PreferredSourceButton({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const initialized = useRef(false);

  useEffect(() => {
    // `resolvedTheme` is undefined until next-themes hydrates. Initializing
    // before then would hand the library no theme and get its "light" default
    // on what is a dark-by-default site.
    if (!resolvedTheme || initialized.current) return;
    initialized.current = true;

    if (!globalThis.PREFERRED_SOURCE) {
      globalThis.PREFERRED_SOURCE = [];
    }
    globalThis.PREFERRED_SOURCE.push((preferredSource) => {
      // `lang` is deliberately omitted: the library localizes the button from
      // the reader's browser settings, which beats pinning it to the site's.
      preferredSource.init({
        theme: resolvedTheme === "dark" ? "dark" : "light",
      });
    });
  }, [resolvedTheme]);

  return (
    // The width is load-bearing, not decorative. The library styles the host
    // div `position: relative; width: 100%` and absolutely positions its iframe
    // to fill it, so the host inherits whatever width this wrapper resolves to.
    // In the footer's `items-start` flex column that is shrink-to-fit, i.e. 0 —
    // the button mounts, reports `data-initialized`, and renders nothing
    // visible. The class has to sit on this wrapper rather than the host below,
    // because the library overwrites the host's inline style.
    <div className={cn("w-full max-w-[260px]", className)}>
      <Script
        id="google-preferred-sources"
        src="https://news.google.com/swg/js/v1/publisher.js"
        strategy="afterInteractive"
        // Suppresses the library's automatic start-up scan so the effect above
        // owns initialization. Without it the library renders whichever buttons
        // happen to exist at load and ignores every later one.
        preferred-sources-control="manual"
      />
      <div google-add-preferred-source-btn="" />
    </div>
  );
}
