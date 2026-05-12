"use client";

import { FileText, GitBranch, Package, Star } from "lucide-react";
import { CountUp, Stagger, StaggerItem } from "./profile-motion";

interface KPIProps {
  github: { totalStars: number; totalRepos: number };
  crates: { totalDownloads: number; totalCrates: number };
  recentCount: number;
  recentLabel: string;
  lastPushRelative: string;
  lastPushRepo: string;
}

function formatStarsCompact(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toString();
}

function formatPlain(n: number): string {
  return n.toLocaleString("en-US");
}

export function ProfileKPIs({
  github,
  crates,
  recentCount,
  recentLabel,
  lastPushRelative,
  lastPushRepo,
}: KPIProps) {
  return (
    <Stagger className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StaggerItem>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-text-muted">
            <Star className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">
              GitHub stars
            </span>
          </div>
          <div className="mt-3 font-display text-3xl text-text-primary">
            <CountUp format={formatStarsCompact} value={github.totalStars} />
          </div>
          <div className="mt-1 text-xs text-text-muted">
            across{" "}
            <CountUp duration={1.0} format={formatPlain} value={github.totalRepos} />{" "}
            repos
          </div>
        </div>
      </StaggerItem>
      <StaggerItem>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-text-muted">
            <Package className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">
              crates.io downloads
            </span>
          </div>
          <div className="mt-3 font-display text-3xl text-text-primary">
            <CountUp
              format={formatStarsCompact}
              value={crates.totalDownloads}
            />
          </div>
          <div className="mt-1 text-xs text-text-muted">
            <CountUp duration={1.0} format={formatPlain} value={crates.totalCrates} />{" "}
            Life Agent OS crates published
          </div>
        </div>
      </StaggerItem>
      <StaggerItem>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-text-muted">
            <FileText className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">
              {recentLabel}
            </span>
          </div>
          <div className="mt-3 font-display text-3xl text-text-primary">
            <CountUp duration={1.2} format={formatPlain} value={recentCount} />
          </div>
          <div className="mt-1 text-xs text-text-muted">
            posts + notes in latest cycle
          </div>
        </div>
      </StaggerItem>
      <StaggerItem>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-text-muted">
            <GitBranch className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">
              Most recent push
            </span>
          </div>
          <div className="mt-3 font-display text-3xl text-text-primary">
            {lastPushRelative}
          </div>
          <div className="mt-1 truncate text-xs text-text-muted">
            {lastPushRepo}
          </div>
        </div>
      </StaggerItem>
    </Stagger>
  );
}
