"use client";

import {
  ActivityIcon,
  BadgeCheck,
  BarChart3Icon,
  Bell,
  BookOpen,
  BotIcon,
  BoxIcon,
  BrainIcon,
  ChevronRight,
  ChevronsUpDown,
  CircuitBoardIcon,
  CreditCard,
  DatabaseIcon,
  DollarSignIcon,
  LogOut,
  MoreHorizontal,
  Radio,
  Settings2,
  ShieldIcon,
  Sparkles,
  WalletIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const consoleNav = [
  {
    title: "Dashboard",
    url: "/console",
    icon: BrainIcon,
    items: [
      { title: "Overview", url: "/console" },
      { title: "Sessions", url: "/console/sessions" },
    ],
  },
  {
    title: "Memory",
    url: "/console/memory",
    icon: BookOpen,
    items: [{ title: "Knowledge Graph", url: "/console/memory" }],
  },
  {
    title: "Autonomic",
    url: "/console/autonomic",
    icon: ActivityIcon,
    items: [{ title: "Homeostasis", url: "/console/autonomic" }],
  },
  {
    title: "Finance",
    url: "/console/finance",
    icon: WalletIcon,
    items: [{ title: "Transactions", url: "/console/finance" }],
  },
  {
    title: "Lago",
    url: "/console/lago",
    icon: DatabaseIcon,
    items: [
      { title: "Dashboard", url: "/console/lago" },
      { title: "Sessions", url: "/console/lago/sessions" },
      { title: "Blobs", url: "/console/lago/blobs" },
      { title: "Policy", url: "/console/lago/policy" },
      { title: "Metrics", url: "/console/lago/metrics" },
    ],
  },
  {
    title: "Agents",
    url: "/console/agents",
    icon: BotIcon,
    items: [{ title: "Overview", url: "/console/agents" }],
  },
  {
    title: "Sandboxes",
    url: "/console/sandboxes",
    icon: BoxIcon,
    items: [{ title: "Environments", url: "/console/sandboxes" }],
  },
  {
    title: "Relay",
    url: "/console/relay",
    icon: Radio,
    items: [{ title: "Sessions", url: "/console/relay" }],
  },
  {
    title: "Usage",
    url: "/console/usage",
    icon: BarChart3Icon,
    items: [{ title: "Overview", url: "/console/usage" }],
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings2,
    items: [
      { title: "General", url: "/settings" },
      { title: "Models", url: "/settings/models" },
    ],
  },
];

const services = [
  { name: "Arcan", url: "/console", icon: CircuitBoardIcon },
  { name: "Lago", url: "/console/memory", icon: BrainIcon },
  { name: "Autonomic", url: "/console/autonomic", icon: ShieldIcon },
  { name: "Haima", url: "/console/finance", icon: DollarSignIcon },
];

export function ConsoleSidebar({
  userName = "Agent",
  userEmail = "agent@life.os",
  userAvatar = "",
  className,
}: {
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { isMobile, state } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (isMobile) {
    return (
      <Sidebar collapsible="offcanvas" className={className}>
        <ConsoleSidebarBody
          pathname={pathname}
          userName={userName}
          userEmail={userEmail}
          userAvatar={userAvatar}
        />
      </Sidebar>
    );
  }

  return (
    <div
      className="group peer hidden shrink-0 text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={isCollapsed ? "icon" : ""}
      data-variant="inset"
      data-side="left"
    >
      <aside
        aria-label="Console navigation"
        data-sidebar="sidebar"
        className={cn(
          "flex h-svh shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-linear",
          isCollapsed
            ? "w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
            : "w-[--sidebar-width]",
          className,
        )}
      >
        <ConsoleSidebarBody
          pathname={pathname}
          userName={userName}
          userEmail={userEmail}
          userAvatar={userAvatar}
        />
      </aside>
    </div>
  );
}

function ConsoleSidebarBody({
  pathname,
  userName,
  userEmail,
  userAvatar,
}: {
  pathname: string;
  userName: string;
  userEmail: string;
  userAvatar: string;
}) {
  return (
    <>
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/console">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <BrainIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">Life Console</span>
                  <span className="truncate text-xs">Agent OS</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-4 overflow-y-auto p-0">
        <NavMainSection items={consoleNav} pathname={pathname} />
        <ServicesSection items={services} pathname={pathname} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <UserNav name={userName} email={userEmail} avatar={userAvatar} />
      </SidebarFooter>
    </>
  );
}

function NavMainSection({
  items,
  pathname,
}: {
  items: typeof consoleNav;
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isActive =
            pathname === item.url ||
            item.items?.some((sub) => pathname === sub.url);

          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={isActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    <item.icon />
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[collapsible=icon]:hidden group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === subItem.url}
                        >
                          <Link href={subItem.url as Route}>
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function ServicesSection({
  items,
  pathname,
}: {
  items: typeof services;
  pathname: string;
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Services</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild isActive={pathname === item.url}>
              <Link href={item.url as Route}>
                <item.icon />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton className="text-sidebar-foreground/70">
            <MoreHorizontal className="text-sidebar-foreground/70" />
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function UserNav({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar: string;
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={avatar} alt={name} />
                <AvatarFallback className="rounded-lg">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={avatar} alt={name} />
                  <AvatarFallback className="rounded-lg">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-xs">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Sparkles />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
