"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * GitHubPlots — embeds the same live, self-updating "plot" cards that live on
 * the GitHub profile README (github.com/Broomva). Each card is an SVG endpoint
 * that re-renders from the GitHub API on request, so the visuals stay current
 * with zero maintenance.
 *
 * Theme-aware: the site uses class-based `next-themes` (dark by default), so we
 * read `resolvedTheme` and pick the matching card variant. Mount-gated to keep
 * SSR output (dark) identical to the first client render — no hydration flash.
 */

const USER = "broomva";

interface PlotSpec {
  key: string;
  title: string;
  alt: string;
  span: "half" | "full";
  src: (dark: boolean) => string;
}

const PLOTS: PlotSpec[] = [
  {
    key: "stats",
    title: "Overall stats & rank",
    alt: "GitHub stats card — total commits, stars, PRs, issues, and rank",
    span: "half",
    src: (dark) =>
      `https://broomva-github-stats.vercel.app/api?username=${USER}&show_icons=true&theme=${dark ? "tokyonight" : "default"}&hide_border=true&count_private=true&include_all_commits=true&rank_icon=github&bg_color=00000000&title_color=${dark ? "5B9BFF" : "0A3D8F"}&icon_color=5B9BFF`,
  },
  {
    key: "langs",
    title: "Top languages",
    alt: "Top languages breakdown across public and private repositories",
    span: "half",
    src: (dark) =>
      `https://broomva-github-stats.vercel.app/api/top-langs/?username=${USER}&layout=compact&theme=${dark ? "tokyonight" : "default"}&hide_border=true&langs_count=10&hide=jupyter%20notebook,html,css&bg_color=00000000&title_color=${dark ? "5B9BFF" : "0A3D8F"}`,
  },
  {
    key: "activity",
    title: "Contribution activity",
    alt: "Contribution activity graph over time",
    span: "full",
    src: (dark) =>
      `https://github-readme-activity-graph.vercel.app/graph?username=${USER}&theme=${dark ? "tokyo-night" : "github-light"}&hide_border=true&area=true&custom_title=Contribution%20Activity&bg_color=00000000&color=${dark ? "5B9BFF" : "0A3D8F"}&line=5B9BFF&point=B8D4FF`,
  },
  {
    key: "streak",
    title: "Contribution streak",
    alt: "GitHub contribution streak — current and longest streak",
    span: "half",
    src: (dark) =>
      `https://github-readme-streak-stats.herokuapp.com/?user=${USER}&theme=${dark ? "tokyonight" : "default"}&hide_border=true&date_format=j%20M%5B%20Y%5D&background=00000000&ring=5B9BFF&fire=5B9BFF&currStreakLabel=5B9BFF`,
  },
  {
    key: "productive-time",
    title: "When the commits land",
    alt: "Productive time of day for commits (UTC-5)",
    span: "half",
    src: (dark) =>
      `https://github-profile-summary-cards.vercel.app/api/cards/productive-time?username=${USER}&theme=${dark ? "tokyonight" : "default"}&utcOffset=-5`,
  },
];

function Plot({ spec, dark }: { spec: PlotSpec; dark: boolean }) {
  const src = spec.src(dark);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    <figure
      className={`overflow-hidden rounded-2xl glass p-3 ${
        spec.span === "full" ? "lg:col-span-2" : ""
      }`}
    >
      <img
        alt={spec.alt}
        className="h-auto w-full"
        loading="lazy"
        onError={() => setFailed(true)}
        src={src}
      />
      <figcaption className="mt-2 px-1 text-xs text-text-muted">
        {spec.title}
      </figcaption>
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
  const dark = !mounted || resolvedTheme !== "light";

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {PLOTS.map((spec) => (
        // Key includes the theme so a toggle remounts the figure, resetting the
        // load-error state cleanly (no effect needed).
        <Plot dark={dark} key={`${spec.key}-${dark ? "d" : "l"}`} spec={spec} />
      ))}
    </div>
  );
}
