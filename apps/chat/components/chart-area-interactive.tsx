"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

// Placeholder session activity data — will be wired to real data later
const chartData = [
  { date: "2026-02-19", sessions: 5, toolCalls: 12 },
  { date: "2026-02-20", sessions: 8, toolCalls: 24 },
  { date: "2026-02-21", sessions: 3, toolCalls: 9 },
  { date: "2026-02-22", sessions: 12, toolCalls: 38 },
  { date: "2026-02-23", sessions: 7, toolCalls: 21 },
  { date: "2026-02-24", sessions: 4, toolCalls: 15 },
  { date: "2026-02-25", sessions: 9, toolCalls: 28 },
  { date: "2026-02-26", sessions: 11, toolCalls: 33 },
  { date: "2026-02-27", sessions: 6, toolCalls: 18 },
  { date: "2026-02-28", sessions: 14, toolCalls: 42 },
  { date: "2026-03-01", sessions: 10, toolCalls: 31 },
  { date: "2026-03-02", sessions: 8, toolCalls: 25 },
  { date: "2026-03-03", sessions: 13, toolCalls: 39 },
  { date: "2026-03-04", sessions: 5, toolCalls: 16 },
  { date: "2026-03-05", sessions: 7, toolCalls: 22 },
  { date: "2026-03-06", sessions: 15, toolCalls: 47 },
  { date: "2026-03-07", sessions: 9, toolCalls: 27 },
  { date: "2026-03-08", sessions: 11, toolCalls: 34 },
  { date: "2026-03-09", sessions: 6, toolCalls: 19 },
  { date: "2026-03-10", sessions: 8, toolCalls: 24 },
  { date: "2026-03-11", sessions: 12, toolCalls: 36 },
  { date: "2026-03-12", sessions: 10, toolCalls: 30 },
  { date: "2026-03-13", sessions: 4, toolCalls: 13 },
  { date: "2026-03-14", sessions: 7, toolCalls: 21 },
  { date: "2026-03-15", sessions: 13, toolCalls: 40 },
  { date: "2026-03-16", sessions: 9, toolCalls: 28 },
  { date: "2026-03-17", sessions: 11, toolCalls: 33 },
  { date: "2026-03-18", sessions: 8, toolCalls: 25 },
  { date: "2026-03-19", sessions: 14, toolCalls: 43 },
  { date: "2026-03-20", sessions: 10, toolCalls: 31 },
]

const chartConfig = {
  activity: {
    label: "Activity",
  },
  sessions: {
    label: "Sessions",
    color: "hsl(var(--chart-1))",
  },
  toolCalls: {
    label: "Tool Calls",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("30d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    const referenceDate = new Date("2026-03-20")
    let daysToSubtract = 90
    if (timeRange === "30d") {
      daysToSubtract = 30
    } else if (timeRange === "7d") {
      daysToSubtract = 7
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  return (
    <Card className="@container/card">
      <CardHeader className="relative">
        <CardTitle>Session Activity</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            Agent sessions and tool calls over time
          </span>
          <span className="@[540px]/card:hidden">Session activity</span>
        </CardDescription>
        <div className="absolute right-4 top-4">
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="@[767px]/card:flex hidden"
          >
            <ToggleGroupItem value="90d" className="h-8 px-2.5">
              Last 3 months
            </ToggleGroupItem>
            <ToggleGroupItem value="30d" className="h-8 px-2.5">
              Last 30 days
            </ToggleGroupItem>
            <ToggleGroupItem value="7d" className="h-8 px-2.5">
              Last 7 days
            </ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="@[767px]/card:hidden flex w-40"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillSessions" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-sessions)"
                  stopOpacity={1.0}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-sessions)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillToolCalls" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-toolCalls)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-toolCalls)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="toolCalls"
              type="natural"
              fill="url(#fillToolCalls)"
              stroke="var(--color-toolCalls)"
              stackId="a"
            />
            <Area
              dataKey="sessions"
              type="natural"
              fill="url(#fillSessions)"
              stroke="var(--color-sessions)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
