/**
 * Today's AI allowance, always in view right above the composer as a small orbit, with the figures a click away.
 *
 * Handles: the orbit that shows the allowance (UsageOrbit), which is the whole of what the row shows and is itself the
 * button, and the panel that opens from it with everything in words - used and limit, what is left, a countdown to
 * the refill that re-reads the clock every so often, this project's share, the last request, the project count, and
 * the ways on to the usage page and the plans - so you know how much building is left before starting a long request
 * rather than after. The owner asked for the figures and the countdown, which stood beside the orbit, to be shown only
 * on a click, and for the hover to touch the orbit alone (it swells a little) where the whole row lit up before.
 *
 * The orbit is a small sun with one planet going round it. Where the planet stands is how much of the allowance is
 * spent - the top with nothing used, a full turn clockwise with it all gone - and the orbit it has travelled is lit
 * behind it, with the area it has swept filled in more faintly, in a tone that deepens as it goes, pale gold to a crimson ember (lib/usage-tone.ts; the styles are
 * index.css's .usage-orbit). It starts from the top when it appears and travels to its place, and travels again when
 * the figure changes. The owner asked for usage as a planet revolving round a centre with the tone following how far
 * it has revolved; before this a planet circled a sun for decoration while a shadow crept across it.
 *
 * It moves while a reply streams. The server reports what has been charged plus what the reply in progress is
 * estimated to have spent so far, so the figure is re-read every few seconds for as long as one is being written and
 * the planet travels with it; the provider's own count replaces the estimate when the reply ends, which moves it a
 * little, not a lot. Before this the meter stood still until the reply was over, and a build's sixty-thousand-token
 * hold was counted as spent while it ran - so a look at the meter mid-build showed a jump that was gone on the next
 * refresh. Once the allowance is fully spent it steps aside, because the chat's quota banner already says everything
 * this would.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBilling, USAGE_QUERY_KEY } from "@/hooks/use-billing";
import { api, isAuthenticated } from "@/lib/api";
import { formatResetIn, formatTokens, toQuota } from "@/lib/billing";
import { featureLabel } from "@/lib/usage-insights";
import { USAGE_TRAIL, usageTone } from "@/lib/usage-tone";
import { cn } from "@/lib/utils";

const COUNTDOWN_TICK_MS = 30_000;
const LIVE_REFRESH_MS = 4_000;

function UsageOrbit({ percent, busy }: { percent: number; busy: boolean }) {
  const [placed, setPlaced] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPlaced(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <span
      aria-hidden="true"
      data-usage-turn={percent}
      className={cn("usage-orbit", busy && "usage-orbit-busy")}
      style={{ "--usage-turn": placed ? percent / 100 : 0, "--usage-tone": usageTone(percent), "--usage-trail": USAGE_TRAIL } as CSSProperties}
    >
      <span className="usage-orbit-path" />
      <span className="usage-orbit-area" />
      <span className="usage-orbit-trail" />
      <span className="usage-orbit-sun" />
      <span className="usage-orbit-arm">
        <span className="usage-orbit-planet" />
      </span>
    </span>
  );
}

export function ChatUsageMeter({ projectId, isStreaming }: { projectId: string; isStreaming: boolean }) {
  const navigate = useNavigate();
  const signedIn = isAuthenticated();
  const { subscription } = useBilling();

  const { data: usage } = useQuery({
    queryKey: [...USAGE_QUERY_KEY, projectId],
    queryFn: () => api.getUsageToday(projectId),
    enabled: signedIn && !!projectId,
    staleTime: 15_000,
    refetchInterval: isStreaming ? LIVE_REFRESH_MS : false,
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
          className="usage-trigger mb-1.5 ml-1 flex w-fit rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
        >
          <UsageOrbit percent={quota.percent} busy={isStreaming} />
        </button>
      </PopoverTrigger>

      <PopoverContent side="top" align="start" className="w-[272px] rounded-2xl p-0">
        <div className="border-b border-white/[0.07] px-4 pb-3 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Today&rsquo;s AI usage</p>
            <span className="rounded-full border border-primary/30 bg-primary/[0.12] px-2.5 py-0.5 text-[10px] font-medium text-[hsl(46_100%_88%)]">
              {usage.planName} plan
            </span>
          </div>
          <p className="mt-2 font-display text-[28px] font-semibold leading-none tabular-nums">
            {formatTokens(quota.used)}
            <span className="font-sans text-sm font-normal text-muted-foreground"> / {formatTokens(quota.limit)}</span>
          </p>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              data-usage-fill
              className={cn("h-full rounded-full", tone === "warning" ? "bg-[linear-gradient(90deg,hsl(30_100%_56%),hsl(12_96%_58%))]" : "app-progress-fill !relative")}
              style={{ width: `${quota.percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {isStreaming ? (
              <>{formatTokens(quota.remaining)} left · counting this reply as it&rsquo;s written</>
            ) : (
              <>
                {formatTokens(quota.remaining)} left · resets in {formatResetIn(resetsAt, now)}
                {resetsAt && ` (${resetsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})`}
              </>
            )}
          </p>
        </div>

        <dl className="space-y-1.5 px-4 py-2.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">This project today</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatTokens(usage.projectTokensToday ?? 0)}</dd>
          </div>
          {last && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{lastIsThisChat ? "Last reply" : `Last request · ${featureLabel(last.feature)}`}</dt>
              <dd className="text-right font-medium tabular-nums text-foreground">
                {formatTokens(last.totalTokens)}
                <span className="block text-[10px] text-muted-foreground">
                  {formatTokens(last.inputTokens)} in · {formatTokens(last.outputTokens)} out
                </span>
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Projects</dt>
            <dd className="font-medium tabular-nums text-foreground">{usage.projectsUsed} / {usage.projectsLimit}</dd>
          </div>
        </dl>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-2.5">
          <button
            type="button"
            onClick={() => navigate("/usage")}
            className="wipe-link flex items-center gap-1 text-xs text-primary"
          >
            View detailed usage <ArrowUpRight className="h-3 w-3" />
          </button>
          {(subscription?.isFree || quota.isLow) && (
            <button
              type="button"
              onClick={() => navigate("/pricing")}
              className="btn btn-glass h-6 rounded-full px-2.5 text-[11px] font-semibold text-foreground/90"
            >
              Upgrade
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
