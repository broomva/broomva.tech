"use client"

import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { ConsoleHealth, ServiceStatus } from "@/lib/console/types"

const PAGE_TITLES: Record<string, string> = {
  "/console": "Dashboard",
  "/console/sessions": "Sessions",
  "/console/memory": "Memory",
  "/console/autonomic": "Autonomic",
  "/console/finance": "Finance",
}

const DOT_COLORS: Record<ServiceStatus, string> = {
  healthy: "bg-green-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  unconfigured: "bg-muted-foreground/50",
}

const SERVICE_KEYS = ["arcan", "lago", "autonomic", "haima"] as const

export function SiteHeader() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? "Console"

  const [health, setHealth] = useState<ConsoleHealth | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/console/health", { cache: "no-store" })
      if (res.ok) {
        setHealth(await res.json())
      }
    } catch {
      // Silent fail — dots will show as unconfigured
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const id = setInterval(fetchHealth, 10_000)
    return () => clearInterval(id)
  }, [fetchHealth])

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-1.5">
          {SERVICE_KEYS.map((key) => {
            const status: ServiceStatus =
              health?.[key]?.status ?? "unconfigured"
            return (
              <span
                key={key}
                className={`inline-block size-2 rounded-full ${DOT_COLORS[status]}`}
                title={`${key}: ${status}`}
              />
            )
          })}
        </div>
      </div>
    </header>
  )
}
