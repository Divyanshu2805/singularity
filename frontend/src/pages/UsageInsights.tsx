/**
 * Where the caller's tokens went.
 *
 * Handles: the range picker, the stacked usage chart, the totals, the per-feature and per-project breakdowns, the
 * recent activity table and the CSV export.
 *
 * Ranked bars are scaled to the largest entry rather than to 100%, so a short list still reads. This page pulls in
 * the charting library, which is why it is loaded on demand.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, BarChart3, Download, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar, SidebarSpacer, SidebarToggleSpace } from "@/components/AppSidebar";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { useBilling } from "@/hooks/use-billing";
import { api, isAuthenticated, loginRedirectPath } from "@/lib/api";
import { formatResetIn, formatTokens } from "@/lib/billing";
import {
  FEATURES,
  RANGES,
  compactTokens,
  featureLabel,
  featuresInUse,
  formatShare,
  outputShare,
  peakLabel,
  toChartRows,
  tokensPerRequest,
} from "@/lib/usage-insights";
import type { UsageEvent, UsageRange } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_GLOW: CSSProperties = {
  backgroundImage: [
    "radial-gradient(70% 45% at 50% -8%, hsl(22 90% 55% / 0.22) 0%, transparent 70%)",
    "radial-gradient(35% 30% at 92% 0%, hsl(199 80% 58% / 0.08) 0%, transparent 70%)",
  ].join(", "),
};

const RANGE_KEY = "usage_insights_range";
const PAGE_SIZE = 25;

function Tile({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-panel/70 p-4 backdrop-blur">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-panel/70 p-5 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RankedBar({ label, sublabel, value, share, max, color, onClick }: {
  label: string;
  sublabel?: string;
  value: number;
  share: number;
  max: number;
  color: string;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn("block w-full rounded-lg px-2 py-1.5 text-left", onClick && "transition-colors hover:bg-muted/40")}
    >
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-medium text-foreground/90">
          {label}
          {sublabel && <span className="ml-1.5 font-normal text-muted-foreground">{sublabel}</span>}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatTokens(value)} · {formatShare(share)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/50">
        <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
      </div>
    </Wrapper>
  );
}

export function UsageInsights() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sidebar = useSidebar();
  const signedIn = isAuthenticated();
  const { quota, subscription } = useBilling();

  const [range, setRange] = useState<UsageRange>(() => {
    try {
      const saved = localStorage.getItem(RANGE_KEY);
      return RANGES.some((entry) => entry.value === saved) ? (saved as UsageRange) : "7d";
    } catch {
      return "7d";
    }
  });
  const [isExporting, setExporting] = useState(false);
  const [page, setPage] = useState(0);
  const [events, setEvents] = useState<UsageEvent[]>([]);

  useEffect(() => {
    if (!signedIn) navigate(loginRedirectPath());
  }, [signedIn, navigate]);

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, range);
    } catch {
    }
  }, [range]);

  const insightsQuery = useQuery({
    queryKey: ["usage", "insights", range],
    queryFn: () => api.getUsageInsights(range),
    enabled: signedIn,
  });
  const eventsQuery = useQuery({
    queryKey: ["usage", "events", page],
    queryFn: () => api.getUsageEvents(page, PAGE_SIZE),
    enabled: signedIn,
  });

  useEffect(() => {
    const data = eventsQuery.data;
    if (!data) return;
    setEvents((previous) => (data.page === 0 ? data.events : [...previous, ...data.events.filter((e) => !previous.some((p) => p.id === e.id))]));
  }, [eventsQuery.data]);

  useEffect(() => {
    if (insightsQuery.error) {
      toast({
        title: "Couldn't load your usage",
        description: insightsQuery.error instanceof Error ? insightsQuery.error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [insightsQuery.error, toast]);

  const insights = insightsQuery.data;
  const rows = useMemo(() => (insights ? toChartRows(insights) : []), [insights]);
  const inUse = useMemo(() => (insights ? featuresInUse(insights) : []), [insights]);
  const chartConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(inUse.map((feature) => [feature, { label: FEATURES[feature].label, color: FEATURES[feature].color }])),
    [inUse]
  );

  const showLimitLine = !!insights && insights.range !== "today" && insights.dailyLimit > 0;
  const yMax = useMemo(() => {
    const top = Math.max(0, ...rows.map((row) => row.total));
    return Math.ceil(Math.max(top, showLimitLine ? insights!.dailyLimit : 0) * 1.1) || 1;
  }, [rows, showLimitLine, insights]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.exportUsageCsv(range);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vibecraft-usage-${range}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Couldn't export", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const peak = insights ? peakLabel(insights) : null;
  const split = insights ? outputShare(insights.totals) : 0;
  const maxFeature = Math.max(0, ...(insights?.byFeature.map((entry) => entry.totalTokens) ?? []));
  const maxProject = Math.max(0, ...(insights?.byProject.map((entry) => entry.totalTokens) ?? []));
  const isEmpty = !!insights && insights.totals.totalTokens === 0;

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <SidebarSpacer sidebar={sidebar} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />

        <header className="relative flex h-12 shrink-0 items-center gap-2 px-2">
          <SidebarToggleSpace sidebar={sidebar} />
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-16 pt-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Usage</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Where your AI tokens go - by day, by feature and by project.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-label="Range" className="flex rounded-lg border border-border/60 bg-background/60 p-0.5">
                  {RANGES.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      role="radio"
                      aria-checked={range === entry.value}
                      onClick={() => setRange(entry.value)}
                      className={cn(
                        "h-7 rounded-md px-3 text-xs transition-colors",
                        range === entry.value
                          ? "border border-primary/40 bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={isExporting || isEmpty} onClick={() => void exportCsv()}>
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Tile
                label="Today"
                value={quota ? `${compactTokens(quota.used)} / ${compactTokens(quota.limit)}` : "—"}
                hint={quota ? `Resets in ${formatResetIn(quota.resetsAt)}` : undefined}
              >
                {quota && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className={cn("h-full rounded-full", quota.isExhausted ? "bg-destructive" : quota.isLow ? "bg-amber-500" : "bg-primary")}
                      style={{ width: `${quota.percent}%` }}
                    />
                  </div>
                )}
              </Tile>
              <Tile
                label={range === "today" ? "Used today" : "This period"}
                value={insights ? formatTokens(insights.totals.totalTokens) : "—"}
                hint={insights ? `${formatTokens(insights.totals.requests)} AI requests` : undefined}
              />
              <Tile
                label={range === "today" ? "Per request" : "Daily average"}
                value={insights ? formatTokens(range === "today" ? tokensPerRequest(insights.totals) : insights.averagePerDay) : "—"}
                hint={insights && range !== "today" ? `${formatTokens(tokensPerRequest(insights.totals))} per request` : "tokens"}
              />
              <Tile label={peak?.title ?? "Peak day"} value={peak?.value ?? "—"} hint={insights?.peakDay ? `${formatTokens(insights.peakDay.totalTokens)} tokens` : undefined} />
              <Tile
                label="Days at limit"
                value={insights ? insights.daysAtLimit : "—"}
                hint={insights ? `${insights.planName} · ${compactTokens(insights.dailyLimit)}/day` : undefined}
              />
            </div>

            {insightsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-panel/70 py-24 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your usage&hellip;
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-panel/70 py-20 text-center">
                <BarChart3 className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm font-medium">No AI usage {range === "today" ? "today" : "in this period"}</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Builds, ExplainLLM and the idea interview all show up here as soon as you use them.
                </p>
              </div>
            ) : insights ? (
              <>
                {subscription?.isFree && insights.daysAtLimit > 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <p className="min-w-0 flex-1 text-xs">
                      You hit the free plan's daily limit on {insights.daysAtLimit} {insights.daysAtLimit === 1 ? "day" : "days"} in this period.
                      Upgrading raises your daily budget, so builds don't stop part-way through the day.
                    </p>
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => navigate("/pricing")}>
                      See plans <ArrowUpRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                <Section
                  title={range === "today" ? "Tokens by hour" : "Tokens by day"}
                  description={
                    showLimitLine
                      ? `Stacked by feature. The dashed line is your ${insights.planName} plan's daily limit of ${formatTokens(insights.dailyLimit)}.`
                      : "Stacked by feature. Days roll over at the same time your daily allowance resets."
                  }
                >
                  <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
                    <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.25} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={range === "7d" ? 0 : 16}
                        fontSize={11}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        fontSize={11}
                        domain={[0, yMax]}
                        tickFormatter={(value: number) => compactTokens(value)}
                      />
                      <ChartTooltip
                        cursor={{ fillOpacity: 0.08 }}
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => (
                              <div className="flex w-full items-center justify-between gap-4">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="h-2 w-2 rounded-sm" style={{ background: FEATURES[name as keyof typeof FEATURES]?.color }} />
                                  {featureLabel(String(name))}
                                </span>
                                <span className="font-mono tabular-nums text-foreground">{formatTokens(Number(value))}</span>
                              </div>
                            )}
                          />
                        }
                      />
                      {showLimitLine && (
                        <ReferenceLine
                          y={insights.dailyLimit}
                          stroke="hsl(0 72% 60%)"
                          strokeDasharray="5 4"
                          strokeOpacity={0.8}
                          label={{ value: "Daily limit", position: "insideTopRight", fontSize: 10, fill: "hsl(0 72% 65%)" }}
                        />
                      )}
                      {inUse.map((feature, index) => (
                        <Bar
                          key={feature}
                          dataKey={feature}
                          stackId="usage"
                          fill={`var(--color-${feature})`}
                          radius={index === inUse.length - 1 ? [3, 3, 0, 0] : 0}
                          maxBarSize={range === "90d" ? 12 : 40}
                        />
                      ))}
                    </BarChart>
                  </ChartContainer>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                    {inUse.map((feature) => (
                      <span key={feature} className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={FEATURES[feature].description}>
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FEATURES[feature].color }} />
                        {FEATURES[feature].label}
                      </span>
                    ))}
                  </div>
                </Section>

                <div className="grid gap-4 lg:grid-cols-3">
                  <Section title="Input vs output" description="Output is what the AI writes - long builds and walkthroughs spend most of it.">
                    <p className="font-display text-2xl font-semibold tabular-nums">{formatShare(split)} <span className="text-sm font-normal text-muted-foreground">output</span></p>
                    <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted/50">
                      <div style={{ width: `${(1 - split) * 100}%`, background: "hsl(199 80% 58%)" }} />
                      <div style={{ width: `${split * 100}%`, background: "hsl(22 90% 55%)" }} />
                    </div>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between"><dt className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-sm" style={{ background: "hsl(199 80% 58%)" }} />Input (your messages, files read)</dt><dd className="tabular-nums">{formatTokens(insights.totals.inputTokens)}</dd></div>
                      <div className="flex justify-between"><dt className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-sm" style={{ background: "hsl(22 90% 55%)" }} />Output (code and replies)</dt><dd className="tabular-nums">{formatTokens(insights.totals.outputTokens)}</dd></div>
                    </dl>
                  </Section>

                  <Section title="By feature">
                    <div className="space-y-1">
                      {insights.byFeature.map((entry) => (
                        <RankedBar
                          key={entry.feature}
                          label={featureLabel(entry.feature)}
                          sublabel={entry.requests > 0 ? `${entry.requests} req` : undefined}
                          value={entry.totalTokens}
                          share={entry.share}
                          max={maxFeature}
                          color={FEATURES[entry.feature]?.color ?? "hsl(220 8% 48%)"}
                        />
                      ))}
                    </div>
                  </Section>

                  <Section title="By project" description={insights.byProject.length === 0 ? undefined : "Click a project to open it."}>
                    {insights.byProject.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No project usage in this period.</p>
                    ) : (
                      <div className="space-y-1">
                        {insights.byProject.slice(0, 8).map((entry) => (
                          <RankedBar
                            key={entry.projectId}
                            label={entry.name}
                            sublabel={entry.deleted ? "deleted" : undefined}
                            value={entry.totalTokens}
                            share={entry.share}
                            max={maxProject}
                            color="hsl(22 90% 55%)"
                            onClick={entry.deleted ? undefined : () => navigate(`/projects/${entry.projectId}`)}
                          />
                        ))}
                      </div>
                    )}
                  </Section>
                </div>
              </>
            ) : null}

            <Section
              title="Recent activity"
              description="Every AI request, newest first."
              action={<Activity className="h-4 w-4 text-muted-foreground" />}
            >
              {events.length === 0 && !eventsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Nothing yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">When</th>
                        <th className="py-2 pr-3 font-medium">Feature</th>
                        <th className="py-2 pr-3 font-medium">Project</th>
                        <th className="py-2 pr-3 text-right font-medium">Input</th>
                        <th className="py-2 pr-3 text-right font-medium">Output</th>
                        <th className="py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id} className="border-b border-border/30 last:border-0">
                          <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-sm" style={{ background: FEATURES[event.feature]?.color }} />
                              {featureLabel(event.feature)}
                            </span>
                          </td>
                          <td className="max-w-[220px] truncate py-2 pr-3 text-muted-foreground">
                            {event.projectName ?? (event.projectId ? "Deleted project" : "—")}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatTokens(event.inputTokens)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatTokens(event.outputTokens)}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{formatTokens(event.totalTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {eventsQuery.data?.hasMore && (
                <div className="mt-3 flex justify-center">
                  <Button variant="ghost" size="sm" disabled={eventsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>
                    {eventsQuery.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Load more
                  </Button>
                </div>
              )}
            </Section>
          </div>
        </main>
      </div>

      <AppSidebar sidebar={sidebar} />
    </div>
  );
}

export default UsageInsights;
