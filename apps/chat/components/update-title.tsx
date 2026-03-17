import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

export const UpdateTitle = ({
  title,
  isRunning,
  className,
}: {
  title: string;
  isRunning: boolean;
  className?: string;
}) => {
  if (isRunning) {
    return (
      <Shimmer as="h3" className={cn("font-medium text-sm", className)}>
        {title}
      </Shimmer>
    );
  }

  return <h3 className={cn("font-medium text-sm", className)}>{title}</h3>;
};
