"use client";

import Script from "next/script";
import { useEffect } from "react";

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
 * Because manual mode disables the library's own start-up scan, this component
 * is the only thing that can ever render the button. That makes one invariant
 * load-bearing: `init()` must be reachable on every mount, unconditionally.
 * The theme may decide how the button *looks*; it must never decide whether the
 * button *exists*. An earlier revision returned early until `next-themes` had
 * resolved, so any failure to resolve left the button permanently unrendered —
 * the auto-scan that would otherwise have covered us being exactly what manual
 * mode turned off.
 *
 * The theme is therefore read from the `data-theme` attribute on <html>, which
 * the root layout server-renders and next-themes rewrites in a pre-paint
 * script, and it is read when `init()` actually runs rather than when the
 * callback is queued. Both matter: reading the DOM keeps rendering independent
 * of the theme provider, and reading it late avoids handing the library a theme
 * captured by an earlier mount (the first queued callback renders *every*
 * pending host, so a value captured at push time can already be stale).
 *
 * The library styles the button at init and offers no restyle hook, so toggling
 * the site theme afterwards leaves the button in the theme it was built with
 * until the next mount.
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
  useEffect(() => {
    const callback: PreferredSourceCallback = (preferredSource) => {
      const domTheme = document.documentElement.getAttribute("data-theme");
      // `lang` is deliberately omitted: the library localizes the button from
      // the reader's browser settings, which beats pinning it to the site's.
      preferredSource.init({ theme: domTheme === "light" ? "light" : "dark" });
    };

    if (!globalThis.PREFERRED_SOURCE) {
      globalThis.PREFERRED_SOURCE = [];
    }
    globalThis.PREFERRED_SOURCE.push(callback);

    return () => {
      const queue = globalThis.PREFERRED_SOURCE;
      // Only a pre-load queue is a real array with a pending entry to withdraw.
      // Once loaded, the library swaps in a push-only object that runs
      // callbacks immediately, so nothing is left outstanding to clean up.
      if (Array.isArray(queue)) {
        const index = queue.indexOf(callback);
        if (index !== -1) queue.splice(index, 1);
      }
    };
  }, []);

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
