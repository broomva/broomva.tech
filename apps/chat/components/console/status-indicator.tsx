import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/lib/console/types";

const STATUS_COLORS: Record<ServiceStatus, string> = {
  healthy: "bg-success",
  degraded: "bg-warning",
  down: "bg-error",
  unconfigured: "bg-text-disabled",
};

const STATUS_GLOW: Record<ServiceStatus, string> = {
  healthy: "shadow-[0_0_6px_var(--ag-success)]",
  degraded: "shadow-[0_0_6px_var(--ag-warning)]",
  down: "shadow-[0_0_6px_var(--ag-error)]",
  unconfigured: "",
};

export function StatusIndicator({
  status,
  size = "sm",
}: {
  status: ServiceStatus;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full",
        STATUS_COLORS[status],
        STATUS_GLOW[status],
        size === "sm" ? "size-2" : "size-3"
      )}
      title={status}
    />
  );
}
