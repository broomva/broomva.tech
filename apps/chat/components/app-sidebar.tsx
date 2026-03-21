"use client"

import * as React from "react"
import type { Route } from "next"
import Link from "next/link"
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const navMain = [
  {
    title: "Dashboard",
    url: "/console",
    icon: LayoutDashboardIcon,
  },
  {
    title: "Sessions",
    url: "/console/sessions",
    icon: MessageSquareIcon,
  },
  {
    title: "Memory",
    url: "/console/memory",
    icon: BookOpenIcon,
  },
  {
    title: "Autonomic",
    url: "/console/autonomic",
    icon: ActivityIcon,
  },
  {
    title: "Finance",
    url: "/console/finance",
    icon: WalletIcon,
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
    title: "Settings",
    url: "/console",
    icon: SettingsIcon,
  },
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
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href={"/console" as Route}>
                <BrainIcon className="h-5 w-5" />
                <span className="text-base font-semibold">Life Console</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavDocuments items={services} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  )
}
