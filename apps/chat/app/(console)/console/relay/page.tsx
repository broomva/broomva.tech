"use client";

import {
  ArrowRight,
  MonitorSmartphone,
  Radio,
  Terminal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { RelayLeftPanel } from "@/components/relay/relay-left-panel";
import { RelayRightPanel } from "@/components/relay/relay-right-panel";
import { RelayShell } from "@/components/relay/relay-shell";
import { useRelaySessionsList } from "@/hooks/use-relay-sessions-list";

function RelayCenterEmpty() {
  const { nodes, metrics, loading } = useRelaySessionsList();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
      </div>
    );
  }

  // No nodes registered — show full onboarding
  if (nodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <div className="w-full max-w-lg space-y-8">
          {/* Hero */}
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-indigo-500/20">
              <Radio className="size-6 text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              Remote Agent Sessions
            </h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              Run Claude Code, Codex, or Arcan on any machine and control them
              from this console. Your code stays local — only the conversation
              streams here.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <SetupStep
              step={1}
              title="Install the CLI"
              command="bun add -g @broomva/cli"
              done={false}
            />
            <SetupStep
              step={2}
              title="Sign in"
              command="broomva auth login"
              done={false}
            />
            <SetupStep
              step={3}
              title="Start the relay"
              command="broomva relay start"
              done={false}
            />
          </div>

          {/* Features */}
          <div className="grid grid-cols-3 gap-3">
            <FeatureCard
              icon={<Terminal className="size-4" />}
              title="Local execution"
              description="Agents run on your machine with full filesystem access"
            />
            <FeatureCard
              icon={<MonitorSmartphone className="size-4" />}
              title="Web console"
              description="Monitor, approve tools, and interact from any browser"
            />
            <FeatureCard
              icon={<Zap className="size-4" />}
              title="Real-time"
              description="Live streaming of output, git status, and tool events"
            />
          </div>
        </div>
      </div>
    );
  }

  // Nodes exist but no session selected
  const onlineCount = metrics.nodesOnline;
  const activeCount = metrics.sessionsActive;

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Radio className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-medium">Select a session</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {onlineCount > 0
              ? `${onlineCount} node${onlineCount !== 1 ? "s" : ""} online${activeCount > 0 ? `, ${activeCount} active session${activeCount !== 1 ? "s" : ""}` : ""}. Choose one from the sidebar or start a new session.`
              : "Your nodes are offline. Start the relay daemon to reconnect."}
          </p>
        </div>
        {onlineCount === 0 && (
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            broomva relay start
          </div>
        )}
      </div>
    </div>
  );
}

function SetupStep({
  step,
  title,
  command,
  done,
}: {
  step: number;
  title: string;
  command: string;
  done: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <div
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done
            ? "bg-green-500/20 text-green-400"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {step}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <code className="mt-1 block truncate rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-300">
          {command}
        </code>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <p className="text-xs font-medium">{title}</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export default function RelayPage() {
  return (
    <RelayShell>
      <RelayLeftPanel />

      {/* Center — context-aware empty state */}
      <div className="flex flex-1 flex-col border-x bg-background">
        <RelayCenterEmpty />
      </div>

      {/* Right panel — no session context yet */}
      <RelayRightPanel session={null} />
    </RelayShell>
  );
}
