import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/lib/console/types";
import { StatusIndicator } from "./status-indicator";

interface MetricTileProps {
  label: string;
  value: string;
  status: ServiceStatus;
  sublabel?: string;
  className?: string;
}

export function MetricTile({
  label,
  value,
  status,
  sublabel,
  className,
}: MetricTileProps) {
  return (
    <div className={cn("glass-card flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <StatusIndicator status={status} size="md" />
      </div>
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      {sublabel && (
        <span className="text-xs text-text-muted">{sublabel}</span>
      )}
    </div>
  );
}
