import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar, SidebarSpacer, SidebarToggleSpace } from "@/components/AppSidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { useBilling, usePlans } from "@/hooks/use-billing";
import { api, isAuthenticated } from "@/lib/api";
import { cardPrice, formatTokens, hasPaidSubscription, planAction, planActionLabel, planPriceLabel, type PlanAction } from "@/lib/billing";
import { PlanChangeDialog } from "@/components/PlanChangeDialog";
import { Logo } from "@/components/VibeCraftLogo";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";

// The same copper wash the projects pages use, so this doesn't read as a page from a different product.
const PAGE_GLOW: CSSProperties = {
    backgroundImage: [
        "radial-gradient(70% 45% at 50% -8%, hsl(22 90% 55% / 0.22) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 8% 0%, hsl(340 82% 58% / 0.10) 0%, transparent 70%)",
        "radial-gradient(35% 30% at 92% 0%, hsl(38 95% 60% / 0.10) 0%, transparent 70%)",
    ].join(", "),
};

/**
 * What each plan buys, in plain words. Built from the plan's own numbers rather than written out per tier, so
 * a limit changed in the seeder can't leave the marketing copy claiming the old one.
 *
 * <p>`unlimitedAi` is deliberately not mentioned: it is enforced nowhere, and a card promising unlimited AI
 * next to a daily token figure would be contradicting itself.
 */
function planFeatures(plan: Plan): string[] {
    const projects = plan.maxProjects ?? 0;
    const tokens = plan.maxTokensPerDay ?? 0;
    const previews = plan.maxPreviews ?? 0;

    return [
        `${projects} ${projects === 1 ? "project" : "projects"}`,
        `${formatTokens(tokens)} AI tokens per day`,
        `${previews} live ${previews === 1 ? "preview" : "previews"} running at once`,
        plan.isFree ? "Full editor, chat and ExplainLLM" : "Everything in the free plan",
        plan.isFree ? "Teaching mode walkthroughs" : "Priority access when the AI is busy",
    ];
}

/** The plan we point people at by default - the cheapest paid one. */
const isRecommended = (plan: Plan, plans: Plan[]) =>
    !plan.isFree && plans.filter((candidate) => !candidate.isFree)[0]?.id === plan.id;

export function Pricing() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const sidebar = useSidebar();
    const [searchParams, setSearchParams] = useSearchParams();

    const signedIn = isAuthenticated();
    const { data: plans = [], isLoading, error } = usePlans();
    const { subscription } = useBilling();
    const [startingPlanId, setStartingPlanId] = useState<number | null>(null);
    // The plan a paying subscriber has asked to move to, awaiting confirmation.
    const [changingTo, setChangingTo] = useState<Plan | null>(null);

    // Stripe sends a cancelled checkout back here. Say so once, then drop it from the URL so a refresh or a
    // shared link doesn't keep re-announcing a decision the user already made.
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

        // Someone already paying changes the subscription they have. Sending them to Checkout - which is what
        // every card used to do - starts a *second* subscription and bills both, and "Switch to Free" used to
        // just open the billing page and do nothing. Cancel, resume, upgrade and downgrade all go through a
        // confirmation that says what will happen, then change the existing subscription in place.
        if (hasPaidSubscription(subscription)) {
            setChangingTo(plan);
            return;
        }

        // A free user choosing the free plan has nothing to do; its button is already disabled.
        if (plan.isFree) return;

        setStartingPlanId(plan.id);
        try {
            const url = await api.createCheckout(plan.id);
            // A full navigation, not a router push: Stripe Checkout is their page, not ours.
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
        <div className="relative flex h-screen overflow-hidden bg-background">
            {signedIn && <SidebarSpacer sidebar={sidebar} />}

            <div className="relative flex min-w-0 flex-1 flex-col">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />

                <header className="relative flex h-12 shrink-0 items-center gap-2 px-2">
                    {signedIn ? (
                        <SidebarToggleSpace sidebar={sidebar} />
                    ) : (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate("/")}>
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                        </Button>
                    )}
                </header>

                <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
                        <div className="mb-10 text-center">
                            {!signedIn && (
                                <div className="mb-6 flex justify-center">
                                    <Logo />
                                </div>
                            )}
                            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                                Build more, for less than you'd think
                            </h1>
                            <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
                                Every plan includes the whole editor - the AI chat, teaching mode, ExplainLLM and live
                                previews. What changes is how many projects you keep and how much you can build each day.
                            </p>
                        </div>

                        {isLoading ? (
                            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading plans&hellip;
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-3">
                                {plans.map((plan) => {
                                    const action = planAction(plan, subscription, signedIn);
                                    const recommended = isRecommended(plan, plans);
                                    const isStarting = startingPlanId === plan.id;

                                    return (
                                        <div
                                            key={plan.id ?? plan.name}
                                            className={cn(
                                                "relative flex flex-col rounded-2xl border bg-panel/70 p-5 backdrop-blur transition-colors",
                                                recommended
                                                    ? "border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_18px_40px_-24px_hsl(var(--primary)/0.65)]"
                                                    : "border-border/60",
                                                action === "current" && "border-primary/40"
                                            )}
                                        >
                                            {recommended && (
                                                <span className="absolute -top-2.5 left-5 flex items-center gap-1 rounded-full border border-primary/40 bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                                                    <Sparkles className="h-3 w-3" />
                                                    Most popular
                                                </span>
                                            )}

                                            <h2 className="font-display text-lg font-semibold">{plan.name}</h2>
                                            {plan.tagline && (
                                                <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
                                                    {plan.tagline}
                                                </p>
                                            )}

                                            <p className="mt-4 flex items-baseline gap-1">
                                                <span className="font-display text-3xl font-semibold tracking-tight">
                                                    {cardPrice(plan)}
                                                </span>
                                                {plan.billingInterval && (
                                                    <span className="text-xs text-muted-foreground">/{plan.billingInterval}</span>
                                                )}
                                            </p>
                                            <span className="sr-only">{planPriceLabel(plan)}</span>

                                            <ul className="mt-5 flex-1 space-y-2.5">
                                                {planFeatures(plan).map((feature) => (
                                                    <li key={feature} className="flex items-start gap-2 text-xs text-foreground/85">
                                                        <Check className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
                                                        <span>{feature}</span>
                                                    </li>
                                                ))}
                                            </ul>

                                            <Button
                                                className="mt-6 w-full"
                                                variant={buttonVariant(action, recommended)}
                                                disabled={action === "current" || action === "scheduled" || isStarting}
                                                onClick={() => void choose(plan)}
                                            >
                                                {isStarting ? (
                                                    <>
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        Taking you to Stripe&hellip;
                                                    </>
                                                ) : (
                                                    planActionLabel(action, plan, subscription)
                                                )}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <p className="mt-8 text-center text-xs text-muted-foreground">
                            Prices in INR, billed monthly. Cancel any time from{" "}
                            <button type="button" onClick={() => navigate("/settings/billing")} className="text-primary hover:underline">
                                billing settings
                            </button>{" "}
                            - you keep your plan until the period you've paid for ends.
                        </p>
                    </div>
                </main>
            </div>

            {signedIn && <AppSidebar sidebar={sidebar} />}

            <PlanChangeDialog current={subscription} target={changingTo} onClose={() => setChangingTo(null)} />
        </div>
    );
}

/**
 * Emphasis follows what the button does, not which card it sits on. Before, the "Most popular" card's button was
 * always the solid primary one - so a Business subscriber looking at Pro saw a bright orange *downgrade* as the
 * obvious thing to press, while the free plan's button was an off-theme secondary.
 */
function buttonVariant(action: PlanAction, recommended: boolean): "default" | "outline" | "secondary" {
    switch (action) {
        case "upgrade":
        case "resume":
            return "default";
        case "signIn":
            return recommended ? "default" : "outline";
        default:
            // current, scheduled, downgrade: available, but never the thing we push.
            return "outline";
    }
}

export default Pricing;
