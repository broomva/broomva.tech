"use client"

import type * as React from "react"
import {
  ActivityIcon,
  BookOpen,
  BrainIcon,
  CircuitBoardIcon,
  DollarSignIcon,
  MessageSquareIcon,
  Settings2,
  ShieldIcon,
  WalletIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Agent",
    email: "agent@life.os",
    avatar: "",
  },
  teams: [
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
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "#",
      icon: BrainIcon,
      isActive: true,
      items: [
        { title: "Overview", url: "/console" },
        { title: "Sessions", url: "/console/sessions" },
      ],
    },
    {
      title: "Memory",
      url: "#",
      icon: BookOpen,
      items: [
        { title: "Knowledge Graph", url: "/console/memory" },
        { title: "Search", url: "/console/memory" },
      ],
    },
    {
      title: "Autonomic",
      url: "#",
      icon: ActivityIcon,
      items: [
        { title: "Homeostasis", url: "/console/autonomic" },
        { title: "Gating Profiles", url: "/console/autonomic" },
      ],
    },
    {
      title: "Finance",
      url: "#",
      icon: WalletIcon,
      items: [
        { title: "Transactions", url: "/console/finance" },
        { title: "Wallets", url: "/console/finance" },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: Settings2,
      items: [
        { title: "General", url: "/console" },
        { title: "Services", url: "/console" },
      ],
    },
  ],
  projects: [
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
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
