/**
 * The teaching-mode switch.
 *
 * Handles: the pressed state and its explanation - lit while on, when each file the AI writes comes with a
 * plain-English note on the idea it uses.
 */
import { GraduationCap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TeachingModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  size?: "sm" | "md";
  className?: string;
}

export function TeachingModeToggle({ enabled, onChange, size = "sm", className }: TeachingModeToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => onChange(!enabled)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "sm" ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-xs",
            enabled
              ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/20"
              : "border-border/80 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary",
            className
          )}
        >
          <GraduationCap className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
          Teach me
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[250px] px-2.5 py-1.5 text-xs leading-5">
        {enabled
          ? "Teaching mode is on. Every file comes with a short, plain-English note on the idea it uses and why."
          : "Teaching mode: get a short, plain-English note on the idea behind each file as it's built."}
      </TooltipContent>
    </Tooltip>
  );
}
