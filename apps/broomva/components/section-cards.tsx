"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ActivityIcon,
  BrainIcon,
  CircuitBoardIcon,
  DollarSignIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ConsoleHealth, ServiceStatus } from "@/lib/console/types"

const SERVICES = [
  {
    key: "arcan" as const,
    name: "Arcan",
    description: "Agent Runtime",
    icon: CircuitBoardIcon,
  },
  {
    key: "lago" as const,
    name: "Lago",
    description: "Persistence Layer",
    icon: BrainIcon,
  },
  {
    key: "autonomic" as const,
    name: "Autonomic",
    description: "Homeostasis",
    icon: ActivityIcon,
  },
  {
    key: "haima" as const,
    name: "Haima",
    description: "Finance Engine",
    icon: DollarSignIcon,
  },
]

const STATUS_LABEL: Record<ServiceStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  unconfigured: "N/A",
}

const STATUS_BADGE_CLASS: Record<ServiceStatus, string> = {
  healthy:
    "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  degraded:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  down: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  unconfigured:
    "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
}

export function SectionCards() {
  const [health, setHealth] = useState<ConsoleHealth | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/console/health", { cache: "no-store" })
      if (!res.ok) {
        setError(`Health check failed (${res.status})`)
        return
      }
      const data: ConsoleHealth = await res.json()
      setHealth(data)
      setError(null)
    } catch {
      setError("Failed to reach health endpoint")
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const id = setInterval(fetchHealth, 10_000)
    return () => clearInterval(id)
  }, [fetchHealth])

  return (
    <div className="*:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card lg:px-6">
      {SERVICES.map((svc) => {
        const svcHealth = health?.[svc.key]
        const status: ServiceStatus = svcHealth?.status ?? "unconfigured"
        const latency = svcHealth?.latency_ms ?? 0
        const Icon = svc.icon

        return (
          <Card key={svc.key} className="@container/card">
            <CardHeader className="relative">
              <CardDescription className="flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {svc.name}
              </CardDescription>
              <CardTitle className="@[250px]/card:text-3xl text-2xl font-semibold tabular-nums">
                {status === "unconfigured"
                  ? "N/A"
                  : `${latency}ms`}
              </CardTitle>
              <div className="absolute right-4 top-4">
                <Badge
                  variant="outline"
                  className={`flex gap-1 rounded-lg text-xs ${STATUS_BADGE_CLASS[status]}`}
                >
                  <span
                    className={`inline-block size-2 rounded-full ${
                      status === "healthy"
                        ? "bg-green-500"
                        : status === "degraded"
                          ? "bg-amber-500"
                          : status === "down"
                            ? "bg-red-500"
                            : "bg-muted-foreground"
                    }`}
                  />
                  {STATUS_LABEL[status]}
                </Badge>
              </div>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 text-sm">
              <div className="line-clamp-1 flex gap-2 font-medium">
                {svc.description}
              </div>
              <div className="text-muted-foreground">
                {error
                  ? "Retrying..."
                  : health
                    ? `Last check ${new Date(health.timestamp).toLocaleTimeString()}`
                    : "Connecting..."}
              </div>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
