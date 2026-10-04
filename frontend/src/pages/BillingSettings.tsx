/**
 * The billing page: what the caller is on, what they have used, and how to change it.
 *
 * Handles: the current plan and its renewal or cancellation state, the token and project meters, opening the payment
 * provider's portal, changing plan, and settling a checkout the browser has just returned from.
 *
 * Both meters are drawn by the same component, so tokens and projects read as the same kind of thing.
 *
 * It stands on the app's night - a page a step lighter than the surround, a wash of rose, amber and gold breathing at the foot of the
 * screen with stars above it (Nebula - the wash took the gas nebula's place) and one faint gold glow at its head; the first starfield was taken out when the
 * owner found the app too dark to read its panels on, and stars came back when the nebula was redrawn as gas -
 * under the shared page heading (PageHeading - a mono eyebrow, a
 * Fraunces title with an italic gold close, its words dropping in), its panels are solid raised surfaces that rise in one
 * after another (index.css, .app-glass, .app-rise), and anything working shows the app's comet (OrbitSpinner).
 */
import { Nebula } from "@/components/app/Nebula";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { PageHeading } from "@/components/app/PageHeading";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { useBilling, usePlans } from "@/hooks/use-billing";
import { PlanChangeDialog } from "@/components/PlanChangeDialog";
import { PaymentsTestModeNotice } from "@/components/PaymentsTestModeNotice";
import { api, isAuthenticated, loginRedirectPath } from "@/lib/api";
import type { Plan } from "@/lib/types";
import {
    formatResetIn,
    formatTokens,
    needsAttention,
    planPriceLabel,
    subscriptionStatusLabel,
} from "@/lib/billing";
import { cn } from "@/lib/utils";

const PAGE_GLOW: CSSProperties = {
    backgroundImage: [
        "radial-gradient(70% 45% at 50% -8%, hsl(40.7 99.9% 76.1% / 0.07) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 92% 0%, hsl(41.3 100% 85.6% / 0.04) 0%, transparent 70%)",
    ].join(", "),
};

function Meter({ label, used, limit, detail, tone = "default" }: {
    label: string;
    used: number;
    limit: number;
    detail?: string;
    tone?: "default" | "warning" | "exhausted";
}) {
    const percent = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));

    return (
        <div>
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-foreground/85">{label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                    {formatTokens(used)} / {formatTokens(limit)}
                </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                    className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        tone === "exhausted" ? "bg-destructive" : tone === "warning" ? "bg-[linear-gradient(90deg,hsl(30_100%_56%),hsl(12_96%_58%))]" : "app-progress-fill !relative"
                    )}
                    style={{ width: `${percent}%` }}
                />
            </div>
            {detail && <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>}
        </div>
    );
}

export function BillingSettings() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const sidebar = useSidebar();
    const [searchParams, setSearchParams] = useSearchParams();

    const { subscription, usage, quota, projects, isLoading, refresh } = useBilling();
    const [isOpeningPortal, setOpeningPortal] = useState(false);
    const { data: plans = [] } = usePlans();
    const [changingTo, setChangingTo] = useState<Plan | null>(null);
    const freePlan = plans.find((candidate) => candidate.isFree) ?? null;
    const [isConfirming, setConfirming] = useState(searchParams.get("checkout") === "success");

    const signedIn = isAuthenticated();
    useEffect(() => {
        if (!signedIn) navigate(loginRedirectPath());
    }, [signedIn, navigate]);

    const confirmedRef = useRef<string | null>(null);

    useEffect(() => {
        if (searchParams.get("checkout") !== "success") return;
        const sessionId = searchParams.get("session_id");
        if (!sessionId || confirmedRef.current === sessionId) return;
        confirmedRef.current = sessionId;

        void (async () => {
            try {
                await api.confirmCheckout(sessionId);
                await refresh();
                toast({ title: "You're all set", description: "Your new plan is active." });
            } catch (error) {
                toast({
                    title: "Payment received, finishing up",
                    description: error instanceof Error ? error.message : "Refresh in a moment to see your new plan.",
                });
            } finally {
                setConfirming(false);
                setSearchParams({}, { replace: true });
            }
        })();
    }, [searchParams, setSearchParams, refresh, toast]);

    const openPortal = async () => {
        setOpeningPortal(true);
        try {
            const url = await api.openBillingPortal();
            window.location.assign(url);
        } catch (error) {
            setOpeningPortal(false);
            toast({
                title: "Couldn't open the billing portal",
                description: error instanceof Error ? error.message : "Please try again.",
                variant: "destructive",
            });
        }
    };

    const plan = subscription?.plan;
    const attention = needsAttention(subscription);
    const busy = isLoading || isConfirming;

    return (
        <div className="dash-night dash-sky relative flex h-screen overflow-hidden bg-background">
            <Nebula />
            <SidebarSpacer sidebar={sidebar} />

            <div className="dash-frame relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />

                <header className="relative flex h-12 shrink-0 items-center gap-2 px-2">
                </header>

                <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6">
                        <div className="mb-6">
                            <PageHeading eyebrow="Account" title="Plans &" accent="billing">
                                What you're on, what you've used, and how to change it.
                            </PageHeading>
                            <PaymentsTestModeNotice className="mt-4" />
                        </div>

                        {busy ? (
                            <div className="app-glass flex items-center justify-center gap-2 rounded-[22px] py-16 text-sm text-muted-foreground">
                                <OrbitSpinner className="h-4 w-4" />
                                {isConfirming ? "Confirming your payment…" : "Loading your plan…"}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {attention && (
                                    <div className="flex items-start gap-2.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-destructive">
                                                {subscription?.status === "PAST_DUE"
                                                    ? "Your last payment didn't go through"
                                                    : "Your payment hasn't finished"}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                Update your card in the billing portal to keep your plan.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <section className="app-glass app-rise rounded-[22px] p-5" style={{ "--i": 1 } as CSSProperties}>
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="app-label">
                                                Current plan
                                            </p>
                                            <h2 className="mt-1 font-display text-2xl font-semibold">
                                                {plan?.name ?? "Free"}
                                            </h2>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {subscriptionStatusLabel(subscription)}
                                            </p>
                                        </div>
                                        {plan && (
                                            <p className="shrink-0 text-right">
                                                <span className="font-display text-xl font-semibold">{plan.price}</span>
                                                {!plan.isFree && plan.billingInterval && (
                                                    <span className="text-xs text-muted-foreground">
                                                        /{plan.billingInterval}
                                                    </span>
                                                )}
                                                <span className="sr-only">{planPriceLabel(plan)}</span>
                                            </p>
                                        )}
                                    </div>

                                    <div className="mt-5 flex flex-wrap gap-2">
                                        <Button variant="outline" className="gap-1.5" onClick={() => navigate("/pricing")}>
                                            {subscription?.isFree ? "See plans" : "Change plan"}
                                            <ArrowUpRight className="h-3.5 w-3.5 transition-colors [button:hover>&]:text-yellow-400" />
                                        </Button>
                                        {!subscription?.isFree && (
                                            <Button
                                                variant="outline"
                                                className="gap-1.5"
                                                disabled={isOpeningPortal}
                                                onClick={() => void openPortal()}
                                            >
                                                {isOpeningPortal ? (
                                                    <OrbitSpinner className="h-3.5 w-3.5" />
                                                ) : (
                                                    <CreditCard className="h-3.5 w-3.5" />
                                                )}
                                                Manage billing
                                            </Button>
                                        )}
                                        {!subscription?.isFree && subscription?.cancelAtPeriodEnd && plan && (
                                            <Button variant="default" onClick={() => setChangingTo(plan)}>
                                                Keep {plan.name}
                                            </Button>
                                        )}
                                        {!subscription?.isFree && !subscription?.cancelAtPeriodEnd && freePlan && (
                                            <Button
                                                variant="ghost"
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => setChangingTo(freePlan)}
                                            >
                                                Cancel plan
                                            </Button>
                                        )}
                                    </div>
                                </section>

                                <section className="app-glass app-rise rounded-[22px] p-5" style={{ "--i": 2 } as CSSProperties}>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="app-label">Usage</p>
                                        <button
                                            type="button"
                                            onClick={() => navigate("/usage")}
                                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                                        >
                                            View detailed usage
                                            <ArrowUpRight className="h-3 w-3" />
                                        </button>
                                    </div>

                                    <div className="mt-4 space-y-5">
                                        <Meter
                                            label="AI tokens today"
                                            used={quota?.used ?? 0}
                                            limit={quota?.limit ?? 0}
                                            tone={quota?.isExhausted ? "exhausted" : quota?.isLow ? "warning" : "default"}
                                            detail={
                                                quota?.isExhausted
                                                    ? `Spent for today - refills in ${formatResetIn(quota.resetsAt)}.`
                                                    : `Refills in ${formatResetIn(quota?.resetsAt ?? null)}.`
                                            }
                                        />
                                        <Meter
                                            label="Projects"
                                            used={projects?.used ?? 0}
                                            limit={projects?.limit ?? 0}
                                            tone={projects?.isExhausted ? "warning" : "default"}
                                            detail={
                                                projects?.isExhausted
                                                    ? "You're at your plan's limit - upgrade or delete one to start another."
                                                    : undefined
                                            }
                                        />
                                    </div>

                                    {usage && (
                                        <p className="mt-5 text-[11px] text-muted-foreground">
                                            Tokens cover everything the AI does for you - building, ExplainLLM and the
                                            idea interview. The daily allowance resets at midnight.
                                        </p>
                                    )}
                                </section>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <AppSidebar sidebar={sidebar} inset />

            <PlanChangeDialog current={subscription} target={changingTo} onClose={() => setChangingTo(null)} />
        </div>
    );
}

export default BillingSettings;
