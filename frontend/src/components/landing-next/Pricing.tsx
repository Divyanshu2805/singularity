/**
 * The new landing page's plans: the real plans from the server, set on three faint orbits.
 *
 * Handles: the heading (Heading); the plans (usePlans) as cards in the sign-in card's material - each with its tier's
 * icon, name and tagline, the price counting up from nothing once the card has arrived (hooks/use-count-up), and what
 * it includes (lib/billing's planFeatures, the same lines the app's own pricing page shows) - with the recommended plan
 * (lib/billing's isRecommended) standing out: a "Most popular" pill across its top edge, a warmer edge, light pooled
 * along its foot, and its button woven from the same sheet of space-time as the sign-in page's Google button
 * (SpacetimeFabric, its well following the pointer, the button's arrow its mass), while the others carry the app's
 * outline button; behind the row three wide orbits turn slowly (planOrbits, on LoopCanvas), the orrery above having
 * widened into them; the loading and error states; and the line under the plans saying payments are in test mode
 * when they are, with a way to the full pricing page.
 *
 * The row comes in with the scroll, the recommended plan first: it rises into place, and the two beside it slide out
 * from behind it to their own places (wide screens only - stacked, each simply rises), all of it reversing on the way
 * back up; a card's price counts up once the card is most of the way there (LANDED - never gated on an eased chase
 * reaching exactly its end, which once left the old page's figures arriving late). Under reduced motion the cards are
 * in place with their prices shown.
 */
import { useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Check, Layers, RotateCw, Sparkles, Sprout, Zap } from "lucide-react";
import { SpacetimeFabric } from "@/components/auth/SpacetimeFabric";
import { LoopCanvas } from "@/components/cosmos/LoopCanvas";
import { planOrbits } from "@/components/cosmos/feature-scenes";
import { SlideLink } from "@/components/SlideLink";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/landing/motion";
import { usePlans } from "@/hooks/use-billing";
import { useCountUp } from "@/hooks/use-count-up";
import { cardPrice, isRecommended, planFeatures, planPriceLabel } from "@/lib/billing";
import { PAYMENTS_TEST_MODE } from "@/lib/payments-mode";
import { clamp01, easeOut, useScrollScene } from "@/lib/scroll-scene";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Heading } from "./Heading";

const TIER_ICONS = [Sprout, Zap, Building2];
const LANDED = 0.6;
const RISE = 72;
const WIDE = "(min-width: 1024px)";

function Price({ plan, landed }: { plan: Plan; landed: boolean }) {
  const text = cardPrice(plan);
  const match = text.match(/^(\D*)([\d,]+)(.*)$/);
  const amount = match ? Number(match[2].replace(/,/g, "")) : 0;
  const counted = useCountUp(landed ? amount : 0, 0);

  return (
    <p className="mt-5 flex items-baseline" aria-label={planPriceLabel(plan)}>
      {match?.[1] && <span className="mr-1 self-start pt-1 font-display text-[21px] font-medium leading-none text-foreground/70">{match[1]}</span>}
      <span className="font-display text-[42px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
        {match ? `${counted.toLocaleString("en-IN")}${match[3]}` : text}
      </span>
      {plan.billingInterval && !plan.isFree && <span className="ml-2 text-[14px] text-muted-foreground">/ {plan.billingInterval}</span>}
    </p>
  );
}

function FabricButton({ children }: { children: string }) {
  const mark = useRef<HTMLSpanElement>(null);

  return (
    <Button asChild size="lg" className="ln-fabric-button relative isolate h-12 w-full overflow-hidden text-[14px]">
      <SlideLink to="/signup">
        <SpacetimeFabric mass={mark} />
        {children}
        <span ref={mark} className="grid h-4 w-4 shrink-0 place-items-center">
          <ArrowRight className="h-4 w-4" />
        </span>
      </SlideLink>
    </Button>
  );
}

function PlanTile({ plan, featured, order, landed }: { plan: Plan; featured: boolean; order: number; landed: boolean }) {
  const Icon = TIER_ICONS[order] ?? Layers;
  const action = plan.isFree ? "Start for free" : `Choose ${plan.name}`;

  return (
    <article className={cn("ln-plan auth-panel relative flex h-full flex-col", featured && "ln-plan-featured")}>
      {featured && (
        <p className="ln-plan-flag absolute left-1/2 top-0 z-10 flex h-[30px] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full pl-3 pr-3.5 text-[12.5px] font-semibold">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          Most popular
        </p>
      )}
      <div className={cn("relative flex flex-1 flex-col p-6", featured && "pt-9 lg:py-10")}>
        <div className="flex items-center gap-3">
          <span className="tile-icon h-9 w-9 rounded-[11px]">
            <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
          </span>
          <h3 className="font-display text-[22px] font-semibold tracking-tight">{plan.name}</h3>
        </div>
        {plan.tagline && <p className="mt-3.5 min-h-[2.8rem] text-[14px] leading-[1.6] text-muted-foreground">{plan.tagline}</p>}
        <Price plan={plan} landed={landed} />
        <span aria-hidden="true" className={cn("mt-6 block h-px", featured ? "bg-white/[0.12]" : "bg-white/[0.07]")} />
        <ul className="mt-5 flex-1 space-y-2.5">
          {planFeatures(plan).map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-[14px] leading-snug text-foreground/90">
              <span className={cn("mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full", featured ? "ln-tick-featured" : "bg-primary/[0.14] text-primary")}>
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <div className="mt-7">
          {featured ? (
            <FabricButton>{action}</FabricButton>
          ) : (
            <Button asChild variant="outline" size="lg" className="h-12 w-full text-[14px]" style={{ "--icon-hover": "translateX(3px)" } as CSSProperties}>
              <SlideLink to="/signup">
                {action}
                <ArrowRight />
              </SlideLink>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto grid max-w-[440px] gap-5 lg:max-w-[1180px] lg:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="auth-panel h-[30rem] overflow-hidden">
          <div className="app-skeleton h-full w-full opacity-40" />
        </div>
      ))}
    </div>
  );
}

export function Pricing() {
  const { data: plans = [], isLoading, isFetching, error, refetch } = usePlans();
  const reduced = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState<boolean[]>([]);
  const settled = useRef<boolean[]>([]);
  const featured = plans.map((plan) => isRecommended(plan, plans));

  useScrollScene(stageRef, (frame) => {
    const row = stageRef.current;
    if (!row) return;
    const cells = Array.from(row.querySelectorAll<HTMLElement>("[data-plan]"));
    if (cells.length === 0) return;
    const wide = window.matchMedia(WIDE).matches;
    const lead = cells.findIndex((cell) => cell.dataset.featured === "true");
    const hub = wide && lead >= 0 ? cells[lead] : null;
    const rise = reduced ? 1 : easeOut(clamp01((frame.viewport * 0.92 - frame.top) / (frame.viewport * 0.42)));
    const fan = reduced ? 1 : easeOut(clamp01((rise - 0.32) / 0.68));
    let changed = false;
    cells.forEach((cell, index) => {
      const isHub = cell === hub;
      let x = 0;
      let y = 0;
      let opacity = 1;
      let at = 1;
      if (!hub) {
        const own = reduced ? 1 : easeOut(clamp01((frame.viewport * 0.94 - cell.getBoundingClientRect().top + Number(cell.dataset.y ?? 0)) / (frame.viewport * 0.4)));
        y = (1 - own) * RISE;
        opacity = own;
        at = own;
      } else if (isHub) {
        y = (1 - rise) * RISE;
        opacity = rise;
        at = rise;
      } else {
        const toHub = hub.offsetLeft + hub.offsetWidth / 2 - (cell.offsetLeft + cell.offsetWidth / 2);
        x = toHub * (1 - fan) * 0.9;
        y = (1 - rise) * RISE;
        opacity = fan;
        at = fan;
      }
      cell.dataset.y = y.toFixed(1);
      cell.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      cell.style.opacity = opacity.toFixed(3);
      if (at >= LANDED && !settled.current[index]) {
        settled.current[index] = true;
        changed = true;
      }
    });
    if (changed) setLanded(cells.map((_, index) => Boolean(settled.current[index])));
  });

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="landing-wrap relative scroll-mt-20 py-24 sm:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-8 top-56 opacity-90">
        <LoopCanvas scene={planOrbits} still={8} />
      </div>
      <Heading id="pricing-title" eyebrow="Pricing" title="Pick your" accent="orbit." />
      <div ref={stageRef} className="relative mt-16 sm:mt-24">
        {isLoading ? (
          <Skeleton />
        ) : error || plans.length === 0 ? (
          <div className="auth-panel mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-8 text-center">
            <p className="text-[15px] leading-6 text-muted-foreground">The plans couldn&apos;t load just now.</p>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                <RotateCw className={cn(isFetching && "animate-spin")} />
                Try again
              </Button>
              <Link to="/pricing" className="wipe-link text-[13px] text-muted-foreground">
                See pricing
              </Link>
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-[440px] items-stretch gap-5 lg:max-w-[1180px] lg:grid-cols-3">
            {plans.map((plan, position) => (
              <div key={plan.id ?? plan.name} data-plan data-featured={featured[position]} className={cn("relative will-change-transform", featured[position] ? "z-10 lg:-my-4" : "z-0")}>
                <PlanTile plan={plan} featured={featured[position]} order={position} landed={reduced || Boolean(landed[position])} />
              </div>
            ))}
          </div>
        )}
      </div>
      {plans.length > 0 && (
        <p className="relative mt-14 text-center text-[13.5px] text-muted-foreground">
          {PAYMENTS_TEST_MODE && "Payments are in Stripe test mode — no real money moves. "}
          <Link to="/pricing" className="wipe-link text-primary">
            Compare every plan
          </Link>
        </p>
      )}
    </section>
  );
}
