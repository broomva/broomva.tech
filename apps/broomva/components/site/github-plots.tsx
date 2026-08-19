"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * GitHubPlots — embeds the same live, self-updating "plot" cards that live on
 * the GitHub profile README (github.com/Broomva). Each card is an SVG endpoint
 * that re-renders from the GitHub API on request, so the visuals stay current
 * with zero maintenance.
 *
 * The cards are themed to the Arcan Glass tokens (see app/globals.css --ag-*):
 * transparent backgrounds so the surrounding glass shows through, internal
 * titles hidden in favour of one consistent site-styled caption per card, and
 * ai-blue accents throughout — so they read as native panels, not embeds.
 *
 * Theme-aware: the site uses class-based `next-themes` (dark by default), so we
 * read `resolvedTheme` and pick the matching token set. Mount-gated to keep SSR
 * output (dark) identical to the first client render — no hydration flash.
 */

const USER = "broomva";

// Arcan Glass tokens as hex (SVG endpoints need hex, not oklch). Kept in sync
// with the --ag-* custom properties in app/globals.css. ai-blue is theme-stable.
type Tokens = {
  aiBlue: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
};

const TOKENS: Record<"dark" | "light", Tokens> = {
  dark: {
    aiBlue: "5480C7",
    textPrimary: "F8F8F8",
    textSecondary: "9A9EAB",
    textMuted: "60636F",
  },
  light: {
    aiBlue: "5480C7",
    textPrimary: "101321",
    textSecondary: "414453",
    textMuted: "686B79",
  },
};

interface PlotSpec {
  key: string;
  title: string;
  alt: string;
  span: "half" | "full";
  center?: boolean;
  src: (t: Tokens) => string;
}

const PLOTS: PlotSpec[] = [
  {
    key: "stats",
    title: "Overall stats & rank",
    alt: "GitHub stats: total stars, commits, PRs, issues, and rank",
    span: "half",
    src: (t) =>
      `https://broomva-github-stats.vercel.app/api?username=${USER}&show_icons=true&hide_border=true&hide_title=true&count_private=true&include_all_commits=true&rank_icon=default&bg_color=00000000&title_color=${t.aiBlue}&text_color=${t.textSecondary}&icon_color=${t.aiBlue}&ring_color=${t.aiBlue}`,
  },
  {
    key: "langs",
    title: "Top languages",
    alt: "Most-used languages across public repositories",
    span: "half",
    src: (t) =>
      `https://broomva-github-stats.vercel.app/api/top-langs/?username=${USER}&layout=compact&hide_border=true&hide_title=true&langs_count=8&hide=jupyter%20notebook,html,css&bg_color=00000000&text_color=${t.textSecondary}`,
  },
  {
    key: "activity",
    title: "Contribution activity",
    alt: "Contribution activity over the past weeks",
    span: "full",
    src: (t) =>
      `https://github-readme-activity-graph.vercel.app/graph?username=${USER}&hide_border=true&area=true&bg_color=00000000&color=${t.textSecondary}&line=${t.aiBlue}&point=${t.aiBlue}&area_color=${t.aiBlue}&title_color=${t.aiBlue}&custom_title=%20`,
  },
  {
    key: "streak",
    title: "Contribution streak",
    alt: "Current and longest GitHub contribution streak",
    span: "full",
    center: true,
    src: (t) =>
      `https://github-readme-streak-stats.herokuapp.com/?user=${USER}&hide_border=true&date_format=j%20M%5B%20Y%5D&background=00000000&ring=${t.aiBlue}&fire=${t.aiBlue}&currStreakLabel=${t.aiBlue}&stroke=${t.aiBlue}&sideLabels=${t.textSecondary}&dates=${t.textMuted}&currStreakNum=${t.textPrimary}&sideNums=${t.textPrimary}`,
  },
];

function Plot({ spec, tokens }: { spec: PlotSpec; tokens: Tokens }) {
  const src = spec.src(tokens);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    <figure
      className={`rounded-2xl glass p-5 ${
        spec.span === "full" ? "lg:col-span-2" : ""
      }`}
    >
      <figcaption className="mb-3 text-xs uppercase tracking-wider text-text-muted">
        {spec.title}
      </figcaption>
      <img
        alt={spec.alt}
        className={`h-auto w-full ${spec.center ? "mx-auto max-w-xl" : ""}`}
        loading="lazy"
        onError={() => setFailed(true)}
        src={src}
      />
    </figure>
  );
}

export function GitHubPlots() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Default to dark (the site's default theme) until mounted, so the server
  // render and first client render agree.
  const tokens =
    !mounted || resolvedTheme !== "light" ? TOKENS.dark : TOKENS.light;
  const themeKey = tokens === TOKENS.dark ? "d" : "l";

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {PLOTS.map((spec) => (
        // Key includes the theme so a toggle remounts the figure, resetting the
        // load-error state cleanly (no effect needed).
        <Plot key={`${spec.key}-${themeKey}`} spec={spec} tokens={tokens} />
      ))}
    </div>
  );
}
