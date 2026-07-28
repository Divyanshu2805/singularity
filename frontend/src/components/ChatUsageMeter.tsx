/**
 * Today's AI allowance, always in view right above the composer, with the time until it refills beside it.
 *
 * Handles: the bar, the remaining figure and a countdown that re-reads the clock every so often - so you know how
 * much building is left before starting a long request rather than after.
 *
 * Honest while a reply streams: token counts only exist once a response has finished, since they arrive on its last
 * chunk, so mid-stream it shows a moving shimmer and says it will update rather than guessing a number. Once the
 * allowance is fully spent it steps aside, because the chat's quota banner already says everything this would.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronUp, Gauge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBilling, USAGE_QUERY_KEY } from "@/hooks/use-billing";
import { api, isAuthenticated } from "@/lib/api";
import { formatResetIn, formatTokens, toQuota } from "@/lib/billing";
import { compactTokens, featureLabel } from "@/lib/usage-insights";
import { cn } from "@/lib/utils";

const COUNTDOWN_TICK_MS = 30_000;

export function ChatUsageMeter({ projectId, isStreaming }: { projectId: string; isStreaming: boolean }) {
  const navigate = useNavigate();
  const signedIn = isAuthenticated();
  const { subscription } = useBilling();

  const { data: usage } = useQuery({
    queryKey: [...USAGE_QUERY_KEY, projectId],
    queryFn: () => api.getUsageToday(projectId),
    enabled: signedIn && !!projectId,
    staleTime: 15_000,
  });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const quota = toQuota(usage);
  if (!usage || !quota || quota.isExhausted) return null;

  const tone = quota.isLow ? "warning" : "default";
  const last = usage.lastRequest;
  const lastIsThisChat = last?.feature === "BUILD" || last?.feature === "BUILD_RETRY"
    ? String(last.projectId) === String(projectId)
    : false;
  const resetsAt = quota.resetsAt;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${formatTokens(quota.used)} of ${formatTokens(quota.limit)} AI tokens used today. Resets in ${formatResetIn(resetsAt, now)}. Show details.`}
          className="group mb-1.5 flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Gauge className={cn("h-3.5 w-3.5 shrink-0", tone === "warning" ? "text-amber-500" : "text-muted-foreground")} />

          <div className="relative h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                tone === "warning" ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${Math.max(quota.percent, quota.used > 0 ? 1.5 : 0)}%` }}
            />
            {isStreaming && (
              <div className="absolute inset-y-0 w-1/4 animate-[usage-sweep_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-foreground/40 to-transparent motion-reduce:hidden" />
            )}
          </div>

          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            <span className={cn("font-medium", tone === "warning" ? "text-amber-500" : "text-foreground/85")}>
              {compactTokens(quota.used)}
            </span>
            {" / "}
            {compactTokens(quota.limit)}
            <span className="hidden sm:inline"> tokens</span>
          </span>
          <span aria-hidden="true" className="hidden h-3 w-px shrink-0 bg-border sm:block" />
          <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
            {isStreaming ? "Updates after this reply" : `Resets in ${formatResetIn(resetsAt, now)}`}
          </span>
          <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>

      <PopoverContent side="top" align="start" className="w-[300px] p-0">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Today&rsquo;s AI usage</p>
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {usage.planName} plan
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
            {formatTokens(quota.used)}
            <span className="text-sm font-normal text-muted-foreground"> / {formatTokens(quota.limit)}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn("h-full rounded-full", tone === "warning" ? "bg-amber-500" : "bg-primary")}
              style={{ width: `${quota.percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {formatTokens(quota.remaining)} left · resets in {formatResetIn(resetsAt, now)}
            {resetsAt && ` (${resetsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})`}
          </p>
        </div>

        <dl className="space-y-2 px-4 py-3 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">This project today</dt>
            <dd className="tabular-nums">{formatTokens(usage.projectTokensToday ?? 0)}</dd>
          </div>
          {last && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{lastIsThisChat ? "Last reply" : `Last request · ${featureLabel(last.feature)}`}</dt>
              <dd className="text-right tabular-nums">
                {formatTokens(last.totalTokens)}
                <span className="block text-[10px] text-muted-foreground">
                  {formatTokens(last.inputTokens)} in · {formatTokens(last.outputTokens)} out
                </span>
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Projects</dt>
            <dd className="tabular-nums">{usage.projectsUsed} / {usage.projectsLimit}</dd>
          </div>
        </dl>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
          <button
            type="button"
            onClick={() => navigate("/usage")}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View detailed usage <ArrowUpRight className="h-3 w-3" />
          </button>
          {(subscription?.isFree || quota.isLow) && (
            <button
              type="button"
              onClick={() => navigate("/pricing")}
              className="text-xs font-medium text-foreground/80 hover:text-primary"
            >
              Upgrade
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
