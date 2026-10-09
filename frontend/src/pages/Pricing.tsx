/**
 * The public pricing page.
 *
 * Handles: the plan cards with what each one buys, starting a checkout for someone with no subscription, and changing
 * plan in place for someone who already has one.
 *
 * Feature lists are built from each plan's own numbers rather than written out per tier (lib/billing's
 * planFeatures, shared with the landing page's plan section), so a limit changed on the server cannot leave the page
 * claiming the old one. The unlimited-AI flag is deliberately not shown: no plan sets it, and a card promising
 * unlimited AI beside a daily token figure would contradict itself.
 *
 * It stands on the signed-in pages' night (.dash-night) under the horizon mark and a Fraunces headline with an
 * italic gold close. Signed in, the page sits in the rounded inset frame (.dash-frame) beside the docked sidebar, as
 * the dashboard, usage and billing pages do, over the wash of colour at the foot of the screen and the stars above it (Nebula);
 * signed out there is no sidebar and the quiet sky (LandingBackdrop) fills the window, since a visitor arrives here from
 * the landing page's sky, so the wash is asked for without its stars and the stars are that sky's. The owner asked for this page's background
 * to match the others and its cards to match the landing page's, so the cards are the landing's own (PlanCard): glass
 * for the outer plans, the lit card with the "Most popular" pill for the recommended one, and the landing's buttons -
 * the dark primary pill on the recommended card and its quiet twin on the others, or on any card whose button can't
 * be pressed (the current plan, or a free plan already scheduled), which shows no arrow.
 *
 * The cards come in once, when the plans arrive, the way the landing's open with the scroll: the recommended card
 * rises into place first (RISE) and the other two then slide out from behind it to either side (FAN, starting at the
 * recommended card's centre - measured from the grid cells, which never move). When the cards are stacked rather than
 * side by side, each simply rises in turn. Each card is marked landed half-way through its entrance (LAND_AT), which
 * starts its price count, its feature list and its light. Under reduced motion the cards are simply there, landed.
 *
 * Three columns need room: with the sidebar open beside the page they start at xl rather than lg, or the cards would
 * be squeezed too narrow for their buttons (PlanCard's columns).
 */
import { Nebula } from "@/components/app/Nebula";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { HorizonMark } from "@/components/HorizonMark";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { LandingButton } from "@/components/landing/LandingButton";
import { PlanCard } from "@/components/landing/PlanCard";
import { usePrefersReducedMotion } from "@/components/landing/motion";
import { Button } from "@/components/ui/button";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { useBilling, usePlans } from "@/hooks/use-billing";
import { api, isAuthenticated } from "@/lib/api";
import { hasPaidSubscription, isRecommended, planAction, planActionLabel } from "@/lib/billing";
import { PlanChangeDialog } from "@/components/PlanChangeDialog";
import { PaymentsTestModeNotice } from "@/components/PaymentsTestModeNotice";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_GLOW: CSSProperties = {
    backgroundImage: [
        "radial-gradient(70% 45% at 50% -8%, hsl(40.7 99.9% 76.1% / 0.07) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 8% 0%, hsl(28 100% 56% / 0.04) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 92% 0%, hsl(41.3 100% 85.6% / 0.04) 0%, transparent 70%)",
    ].join(", "),
};

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const RISE = { delay: 150, duration: 900, y: 64, scale: 0.94 };
const FAN = { delay: 520, duration: 1000, y: 22, scale: 0.9 };
const STACK_STEP = 120;
const LAND_AT = 0.5;

function useDeal(shape: string, reduced: boolean) {
    const cells = useRef<(HTMLDivElement | null)[]>([]);
    const pops = useRef<(HTMLDivElement | null)[]>([]);
    const [landed, setLanded] = useState<boolean[]>([]);

    useLayoutEffect(() => {
        const roles = shape ? shape.split(",").map((flag) => flag === "true") : [];
        if (roles.length === 0) return;
        if (reduced || typeof Element.prototype.animate !== "function") {
            setLanded(roles.map(() => true));
            return;
        }

        const lead = roles.indexOf(true);
        const hub = lead >= 0 ? cells.current[lead] : null;
        const centre = (cell: HTMLElement) => cell.offsetLeft + cell.offsetWidth / 2;
        const wide = !!hub && cells.current.some((cell, index) => index !== lead && !!cell && Math.abs(cell.offsetTop - hub.offsetTop) < cell.offsetHeight / 2);

        const timers: number[] = [];
        const animations = roles.map((isFeatured, index) => {
            const card = pops.current[index];
            const cell = cells.current[index];
            if (!card || !cell) return null;

            const fanOut = wide && hub && !isFeatured ? centre(hub) - centre(cell) : null;
            const delay = fanOut !== null ? FAN.delay : wide ? RISE.delay : RISE.delay + index * STACK_STEP;
            const duration = fanOut !== null ? FAN.duration : RISE.duration;
            const from = fanOut !== null
                ? `translate3d(${fanOut.toFixed(1)}px, ${FAN.y}px, 0) scale(${FAN.scale})`
                : `translate3d(0, ${RISE.y}px, 0) scale(${RISE.scale})`;

            timers.push(window.setTimeout(() => setLanded((was) => roles.map((_, order) => order === index || Boolean(was[order]))), delay + duration * LAND_AT));
            return card.animate(
                [
                    { transform: from, opacity: 0 },
                    { opacity: 1, offset: fanOut !== null ? 0.2 : 0.4 },
                    { transform: "none", opacity: 1 },
                ],
                { delay, duration, easing: EASE, fill: "backwards" }
            );
        });

        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
            animations.forEach((animation) => animation?.cancel());
        };
    }, [shape, reduced]);

    return { cells, pops, landed };
}

export function Pricing() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const sidebar = useSidebar();
    const reduced = usePrefersReducedMotion();
    const [searchParams, setSearchParams] = useSearchParams();

    const signedIn = isAuthenticated();
    const { data: plans = [], isLoading, error } = usePlans();
    const { subscription } = useBilling();
    const [startingPlanId, setStartingPlanId] = useState<number | null>(null);
    const [changingTo, setChangingTo] = useState<Plan | null>(null);

    const featured = plans.map((plan) => isRecommended(plan, plans));
    const { cells, pops, landed } = useDeal(featured.join(), reduced);
    const columns = signedIn && sidebar.isExpanded ? "xl" : "lg";

    useEffect(() => {
        if (searchParams.get("checkout") !== "cancelled") return;
        toast({ title: "Checkout cancelled", description: "No payment was taken - you can pick a plan whenever you like." });
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams, toast]);

    useEffect(() => {
        if (!error) return;
        toast({
            title: "Couldn't load the plans",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "destructive",
        });
    }, [error, toast]);

    const choose = async (plan: Plan) => {
        if (!signedIn) {
            navigate("/login");
            return;
        }
        if (plan.id == null) return;

        if (hasPaidSubscription(subscription)) {
            setChangingTo(plan);
            return;
        }

        if (plan.isFree) return;

        setStartingPlanId(plan.id);
        try {
            const url = await api.createCheckout(plan.id);
            window.location.assign(url);
        } catch (err) {
            setStartingPlanId(null);
            toast({
                title: "Couldn't start checkout",
                description: err instanceof Error ? err.message : "Please try again.",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="dash-night dash-sky relative flex h-screen overflow-hidden bg-background">
            {!signedIn && <LandingBackdrop mode="quiet" />}
            <Nebula stars={signedIn} />
            {signedIn && <SidebarSpacer sidebar={sidebar} />}

            <div className={cn("relative flex min-w-0 flex-1 flex-col overflow-hidden", signedIn && "dash-frame my-2 mr-2 rounded-2xl")}>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />

                <header className="relative flex h-12 shrink-0 items-center gap-2 px-2">
                    {!signedIn && (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" style={{ "--icon-hover": "translateX(-2px)" } as CSSProperties} onClick={() => navigate("/")}>
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                        </Button>
                    )}
                </header>

                <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <div className="mx-auto w-full max-w-[1080px] px-4 pb-20 pt-6 sm:px-6">
                        <div className="mb-14 text-center">
                            <div className="mb-6 flex justify-center">
                                <span className="relative inline-flex h-14 w-14">
                                    <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[60%] rounded-full" />
                                    <HorizonMark drawn className="relative h-full w-full" />
                                </span>
                            </div>
                            <h1 className="landing-heading app-fade font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[44px]" style={{ "--i": 1 } as CSSProperties}>
                                Build more, for less than <em className="heat-text animate-heat-sweep pr-1 font-medium motion-reduce:animate-none">you&rsquo;d think</em>
                            </h1>
                            <p className="app-fade mx-auto mt-3 max-w-lg text-sm text-muted-foreground" style={{ "--i": 3 } as CSSProperties}>
                                Every plan includes the whole editor - the AI chat, teaching mode, ExplainLLM and live
                                previews. What changes is how many projects you keep and how much you can build each day.
                            </p>
                            <PaymentsTestModeNotice className="mx-auto mt-5 max-w-lg" />
                        </div>

                        {isLoading ? (
                            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                                <OrbitSpinner className="h-4 w-4" />
                                Loading plans&hellip;
                            </div>
                        ) : (
                            <div
                                className={cn(
                                    "mx-auto grid max-w-[440px] items-stretch gap-5",
                                    columns === "xl" ? "xl:max-w-none xl:grid-cols-3" : "lg:max-w-none lg:grid-cols-3"
                                )}
                            >
                                {plans.map((plan, position) => {
                                    const action = planAction(plan, subscription, signedIn);
                                    const locked = action === "current" || action === "scheduled";
                                    const isStarting = startingPlanId === plan.id;

                                    return (
                                        <PlanCard
                                            key={plan.id ?? plan.name}
                                            plan={plan}
                                            featured={featured[position]}
                                            order={position}
                                            landed={Boolean(landed[position])}
                                            columns={columns}
                                            nameAs="h2"
                                            cellRef={(node) => {
                                                cells.current[position] = node;
                                            }}
                                            popRef={(node) => {
                                                pops.current[position] = node;
                                            }}
                                        >
                                            <LandingButton
                                                variant={featured[position] && !locked ? "primary" : "quiet"}
                                                block
                                                arrow={!locked}
                                                busy={isStarting}
                                                knob={isStarting ? <OrbitSpinner className="h-3.5 w-3.5" /> : undefined}
                                                disabled={locked || isStarting}
                                                className={locked ? "!text-white !opacity-100" : undefined}
                                                onClick={() => void choose(plan)}
                                            >
                                                {isStarting ? "Taking you to Stripe…" : planActionLabel(action, plan, subscription)}
                                            </LandingButton>
                                        </PlanCard>
                                    );
                                })}
                            </div>
                        )}

                        <p className="mt-14 text-center text-[13px] text-muted-foreground">
                            Prices in INR, billed monthly. Cancel any time from{" "}
                            <button type="button" onClick={() => navigate("/settings/billing")} className="wipe-link text-primary">
                                billing settings
                            </button>{" "}
                            - you keep your plan until the period you've paid for ends.
                        </p>
                    </div>
                </main>
            </div>

            {signedIn && <AppSidebar sidebar={sidebar} inset />}

            <PlanChangeDialog current={subscription} target={changingTo} onClose={() => setChangingTo(null)} />
        </div>
    );
}

export default Pricing;
