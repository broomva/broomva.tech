"use client"

import type * as React from "react"
import {
  ActivityIcon,
  BookOpenIcon,
  BrainIcon,
  CircuitBoardIcon,
  DollarSignIcon,
  HelpCircleIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  WalletIcon,
} from "lucide-react"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { TeamSwitcher } from "@/components/team-switcher"

const navMain = [
  {
    title: "Dashboard",
    url: "/console",
    icon: LayoutDashboardIcon,
    isActive: true,
    items: [
      { title: "Overview", url: "/console" },
      { title: "Sessions", url: "/console/sessions" },
    ],
  },
  {
    title: "Memory",
    url: "/console/memory",
    icon: BookOpenIcon,
    items: [
      { title: "Knowledge Graph", url: "/console/memory" },
      { title: "Search", url: "/console/memory" },
    ],
  },
  {
    title: "Autonomic",
    url: "/console/autonomic",
    icon: ActivityIcon,
    items: [
      { title: "Homeostasis", url: "/console/autonomic" },
      { title: "Gating Profiles", url: "/console/autonomic" },
    ],
  },
  {
    title: "Finance",
    url: "/console/finance",
    icon: WalletIcon,
    items: [
      { title: "Transactions", url: "/console/finance" },
      { title: "Wallets", url: "/console/finance" },
    ],
  },
  {
    title: "Settings",
    url: "/console/settings",
    icon: SettingsIcon,
    items: [
      { title: "General", url: "/console" },
      { title: "Services", url: "/console" },
    ],
  },
]

const services = [
  {
    name: "Arcan",
    url: "/console",
    icon: CircuitBoardIcon,
  },
  {
    name: "Lago",
    url: "/console/memory",
    icon: BrainIcon,
  },
  {
    name: "Autonomic",
    url: "/console/autonomic",
    icon: ShieldIcon,
  },
  {
    name: "Haima",
    url: "/console/finance",
    icon: DollarSignIcon,
  },
]

const navSecondary = [
  {
    title: "Help",
    url: "/console",
    icon: HelpCircleIcon,
  },
  {
    title: "Search",
    url: "/console/memory",
    icon: SearchIcon,
  },
]

const teams = [
  {
    name: "Life Console",
    logo: BrainIcon,
    plan: "Agent OS",
  },
  {
    name: "Chat",
    logo: MessageSquareIcon,
    plan: "Sessions",
  },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name: string
    email: string
    avatar: string
  }
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const userData = user ?? {
    name: "Agent",
    email: "agent@life.os",
    avatar: "",
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavDocuments items={services} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
