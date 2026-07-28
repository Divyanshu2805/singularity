/**
 * The shimmering placeholder shown where content is still loading.
 *
 * Handles: the pulse, sized by whatever classes the caller passes.
 */
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
