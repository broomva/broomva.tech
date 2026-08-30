// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/script is irrelevant here: the assertions are about init being reached,
// not about the tag being injected, and jsdom would not execute it anyway.
vi.mock("next/script", () => ({ default: () => null }));

import { PreferredSourceButton } from "./preferred-source-button";

type InitOptions = { theme?: string; lang?: string };

/** Stands in for the loaded library: runs pushed callbacks immediately. */
function installLoadedLibrary() {
  const calls: Array<InitOptions> = [];
  const api = {
    init: (options: InitOptions) => calls.push(options),
    addPreferredSource: () => {},
  };
  // @ts-expect-error — assigning the library's post-load push-only object.
  globalThis.PREFERRED_SOURCE = {
    push: (...fns: Array<(a: typeof api) => void>) => {
      for (const fn of fns) fn(api);
    },
  };
  return calls;
}

/** Drains the pre-load array the way the library does once it loads. */
function drainPendingQueue() {
  const calls: Array<InitOptions> = [];
  const api = {
    init: (options: InitOptions) => calls.push(options),
    addPreferredSource: () => {},
  };
  const queue = globalThis.PREFERRED_SOURCE;
  if (Array.isArray(queue)) for (const fn of queue) fn(api);
  return calls;
}

beforeEach(() => {
  globalThis.PREFERRED_SOURCE = undefined;
  document.documentElement.removeAttribute("data-theme");
});

afterEach(cleanup);

describe("PreferredSourceButton", () => {
  it("renders the host element the library looks for", () => {
    const { container } = render(<PreferredSourceButton />);
    expect(
      container.querySelector("[google-add-preferred-source-btn]"),
    ).not.toBeNull();
  });

  // The core regression. Manual mode disables the library's own start-up scan,
  // so if init() is ever made conditional, the button silently never renders
  // and there is no fallback path left to cover it.
  it("initializes unconditionally on mount", () => {
    const calls = installLoadedLibrary();
    render(<PreferredSourceButton />);
    expect(calls).toHaveLength(1);
  });

  it("queues initialization when the library has not loaded yet", () => {
    render(<PreferredSourceButton />);
    expect(Array.isArray(globalThis.PREFERRED_SOURCE)).toBe(true);
    expect(globalThis.PREFERRED_SOURCE).toHaveLength(1);
  });

  it("takes the theme from data-theme on <html>", () => {
    const calls = installLoadedLibrary();
    document.documentElement.setAttribute("data-theme", "light");
    render(<PreferredSourceButton />);
    expect(calls[0]?.theme).toBe("light");
  });

  it("defaults to dark, the site's server-seeded ground", () => {
    const calls = installLoadedLibrary();
    render(<PreferredSourceButton />);
    expect(calls[0]?.theme).toBe("dark");
  });

  // The first queued callback renders *every* pending host, so a theme captured
  // when the callback was queued could be applied to a later mount. Reading the
  // DOM at init time is what keeps that from going stale.
  it("reads the theme when init runs, not when the callback is queued", () => {
    render(<PreferredSourceButton />);
    // Theme changes after mount but before the library loads and drains.
    document.documentElement.setAttribute("data-theme", "light");
    const calls = drainPendingQueue();
    expect(calls[0]?.theme).toBe("light");
  });

  // Without cleanup, every remount that happens before the script loads leaves
  // another closure queued for the lifetime of the page.
  it("withdraws its queued callback on unmount", () => {
    const { unmount } = render(<PreferredSourceButton />);
    expect(globalThis.PREFERRED_SOURCE).toHaveLength(1);
    unmount();
    expect(globalThis.PREFERRED_SOURCE).toHaveLength(0);
  });

  // The host div must not carry Google's `data-theme` attribute: globals.css
  // defines the palette under a bare [data-theme="dark"] selector that matches
  // any element, so it would re-scope the site's design tokens for the subtree.
  it("does not put data-theme on the host element", () => {
    const { container } = render(<PreferredSourceButton />);
    const host = container.querySelector("[google-add-preferred-source-btn]");
    expect(host?.hasAttribute("data-theme")).toBe(false);
  });
});
