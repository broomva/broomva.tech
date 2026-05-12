/**
 * Life Agent OS Console — constants
 */

import {
  BarChart3,
  Bot,
  Box,
  Brain,
  Building2,
  CircuitBoard,
  DollarSign,
  Home,
  Layers,
  type LucideIcon,
  MessageSquare,
  Radio,
  Rocket,
  Search,
  Shield,
  Store,
} from "lucide-react";

/** Polling intervals in milliseconds */
export const POLL = {
  HEALTH: 10_000,
  SESSIONS: 10_000,
  FINANCE: 30_000,
  USAGE: 30_000,
  SANDBOXES: 15_000,
  RELAY: 5_000,
} as const;

export interface ServiceDef {
  key: "arcan" | "lago" | "autonomic" | "haima";
  name: string;
  description: string;
  icon: LucideIcon;
}

export const SERVICES: ServiceDef[] = [
  {
    key: "arcan",
    name: "Arcan",
    description: "Orchestration runtime",
    icon: CircuitBoard,
  },
  {
    key: "lago",
    name: "Lago",
    description: "Memory & knowledge graph",
    icon: Brain,
  },
  {
    key: "autonomic",
    name: "Autonomic",
    description: "Self-regulation & gating",
    icon: Shield,
  },
  {
    key: "haima",
    name: "Haima",
    description: "Financial state engine",
    icon: DollarSign,
  },
] as const;

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const CONSOLE_NAV: NavItem[] = [
  { key: "overview", label: "Overview", href: "/console", icon: Home },
  {
    key: "sessions",
    label: "Sessions",
    href: "/console/sessions",
    icon: MessageSquare,
  },
  { key: "memory", label: "Memory", href: "/console/memory", icon: Search },
  {
    key: "autonomic",
    label: "Autonomic",
    href: "/console/autonomic",
    icon: Layers,
  },
  {
    key: "finance",
    label: "Finance",
    href: "/console/finance",
    icon: DollarSign,
  },
  {
    key: "agents",
    label: "Agents",
    href: "/console/agents",
    icon: Bot,
  },
  {
    key: "marketplace",
    label: "Marketplace",
    href: "/console/marketplace",
    icon: Store,
  },
  {
    key: "usage",
    label: "Usage",
    href: "/console/usage",
    icon: BarChart3,
  },
  {
    key: "deployments",
    label: "Deployments",
    href: "/console/deployments",
    icon: Rocket,
  },
  {
    key: "relay",
    label: "Relay",
    href: "/console/relay",
    icon: Radio,
  },
  {
    key: "sandboxes",
    label: "Sandboxes",
    href: "/console/sandboxes",
    icon: Box,
  },
  {
    key: "organization",
    label: "Organization",
    href: "/console/organization",
    icon: Building2,
  },
] as const;
