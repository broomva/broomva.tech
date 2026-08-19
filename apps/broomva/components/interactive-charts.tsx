import ReactECharts from "echarts-for-react/lib/index";
import type { EChartsOption } from "echarts-for-react/lib/types";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { Card } from "@/components/ui/card";

import { useEffect, useState } from "react";

// The chart palette is the brand's, read from the design tokens at runtime (ECharts paints to a canvas, so
// CSS var() strings cannot be passed through — the computed values can). Series cycle through the five
// chart tokens, then the functional colours; text/grid/tooltip come from the same token sheet.
const CHART_TOKENS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--ag-success",
  "--ag-warning",
  "--ag-error",
] as const;

type ChartTheme = {
  series: string[];
  text: string;
  grid: string;
  tooltipBg: string;
};

function readChartTheme(): ChartTheme {
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    series: CHART_TOKENS.map((t) => read(t, "currentColor")),
    text: read("--ag-text-primary", "currentColor"),
    grid: read("--ag-border-subtle", "currentColor"),
    tooltipBg: read("--ag-bg-elevated", "transparent"),
  };
}

function useChartTheme(theme: string | undefined): ChartTheme | null {
  const [t, setT] = useState<ChartTheme | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `theme` is the trigger — tokens are re-read when the theme flips
  useEffect(() => {
    setT(readChartTheme());
  }, [theme]);
  return t;
}

export type BaseChart = {
  type: string;
  title: string;
  x_label?: string;
  y_label?: string;
  elements: any[];
  x_scale?: string;
};

function InteractiveChart({ chart }: { chart: BaseChart }) {
  const { resolvedTheme } = useTheme();
  const palette = useChartTheme(resolvedTheme);
  const CHART_COLORS = palette?.series ?? ["currentColor"];
  const textColor = palette?.text ?? "currentColor";
  const gridColor = palette?.grid ?? "currentColor";
  const tooltipBg = palette?.tooltipBg ?? "transparent";

  const sharedOptions: EChartsOption = {
    backgroundColor: "transparent",
    grid: {
      top: 50,
      right: 32,
      bottom: 32,
      left: 32,
      containLabel: true,
    },
    legend: {
      textStyle: { color: textColor },
      top: 8,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 16,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: tooltipBg,
      borderWidth: 0,
      padding: [6, 10],
      className:
        "echarts-tooltip rounded-lg! border! border-neutral-200! dark:border-neutral-800!",
      textStyle: {
        color: textColor,
        fontSize: 13,
        fontFamily: "var(--ag-font-body)",
      },
    },
  };

  const getChartOptions = (): EChartsOption => {
    const defaultAxisOptions = {
      axisLine: { show: true, lineStyle: { color: gridColor } },
      axisTick: { show: false },
      axisLabel: {
        color: textColor,
        margin: 8,
        fontSize: 11,
        hideOverlap: true,
      },
      nameTextStyle: {
        color: textColor,
        fontSize: 13,
        padding: [0, 0, 0, 0],
      },
      splitLine: {
        show: true,
        lineStyle: { color: gridColor, type: "dashed" },
      },
    };

    if (chart.type === "line" || chart.type === "scatter") {
      const series = chart.elements.map((e, index) => ({
        name: e.label,
        type: chart.type,
        data: e.points.map((p: [number | string, number]) => {
          // Handle datetime x-axis
          const x =
            chart.x_scale === "datetime" ? new Date(p[0]).getTime() : p[0];
          return [x, p[1]];
        }),
        smooth: true,
        symbolSize: chart.type === "scatter" ? 10 : 0,
        lineStyle: {
          width: 2,
          color: CHART_COLORS[index % CHART_COLORS.length],
        },
        itemStyle: {
          color: CHART_COLORS[index % CHART_COLORS.length],
        },
        areaStyle:
          chart.type === "line"
            ? {
                opacity: 0.1,
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    {
                      offset: 0,
                      color: CHART_COLORS[index % CHART_COLORS.length],
                    },
                    {
                      offset: 1,
                      color: "transparent",
                    },
                  ],
                },
              }
            : undefined,
      }));

      return {
        ...sharedOptions,
        xAxis: {
          type: chart.x_scale === "datetime" ? "time" : "value",
          name: chart.x_label,
          nameLocation: "middle",
          nameGap: 40,
          scale: true,
          ...defaultAxisOptions,
          axisLabel: {
            ...defaultAxisOptions.axisLabel,
            formatter:
              chart.x_scale === "datetime"
                ? (value: number) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    });
                  }
                : undefined,
          },
        },
        yAxis: {
          type: "value",
          name: chart.y_label,
          nameLocation: "middle",
          nameGap: 50,
          position: "right",
          scale: true,
          ...defaultAxisOptions,
        },
        series,
      };
    }

    if (chart.type === "bar") {
      const data = chart.elements.reduce((acc: Record<string, any[]>, item) => {
        const key = item.group;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(item);
        return acc;
      }, {});

      const series = Object.entries(data).map(([group, elements], index) => ({
        name: group,
        type: "bar",
        stack: "total",
        data: elements?.map((e) => [e.label, e.value]),
        itemStyle: {
          color: CHART_COLORS[index % CHART_COLORS.length],
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0,0,0,0.3)",
          },
        },
      }));

      return {
        ...sharedOptions,
        xAxis: {
          type: "category",
          name: chart.x_label,
          nameLocation: "middle",
          nameGap: 40,
          ...defaultAxisOptions,
        },
        yAxis: {
          type: "value",
          name: chart.y_label,
          nameLocation: "middle",
          nameGap: 50,
          position: "right",
          ...defaultAxisOptions,
        },
        series,
      };
    }

    return sharedOptions;
  };

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="overflow-hidden border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="p-6">
          {chart.title && (
            <h3 className="mb-4 font-medium text-lg text-neutral-900 dark:text-neutral-100">
              {chart.title}
            </h3>
          )}
          <ReactECharts
            notMerge={true}
            option={getChartOptions()}
            style={{ height: "400px", width: "100%" }}
            theme={resolvedTheme === "dark" ? "dark" : undefined}
          />
        </div>
      </Card>
    </motion.div>
  );
}

export default InteractiveChart;
