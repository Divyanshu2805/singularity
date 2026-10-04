/**
 * One plan's card, shared by the landing page's plans (PlanShowcase) and the pricing page, so the two show the same
 * card; each page brings its own button and its own entrance.
 *
 * Handles: the card's layout, its two looks, the price counting up, the feature list ticking in, and how the card
 * answers the pointer.
 *
 * Every card has one layout so its rows line up with its neighbours': a small tile with the tier's icon beside the
 * plan's name (TIER_ICONS, by position, so it holds for whatever plans the server sends), the tagline, the price with
 * its currency sign set small, a hairline, an "Includes" label and the list, and the caller's button at the foot. The
 * recommended card is the same card with a "Most popular" pill sitting across its top edge - filled with the button's
 * gold and set in the reading face; it was a tinted band across the card's top in small uppercase mono, and the
 * owner asked for a different font and look - and more room above and below; in three columns it is pulled out by
 * that extra room at both ends, so it stands taller than its neighbours while every row inside it still lines up with
 * theirs (columns names the breakpoint where the caller's row becomes three columns: the landing's is lg, and the
 * pricing page's is xl while the sidebar is open beside it). The card itself doesn't clip (the pill hangs over its edge), so the glare takes the card's rounding instead.
 *
 * The other cards are the page's glass - the same frosted charcoal as the landing's questions - so the sky shows through
 * them; on the signed-in pages (.dash-night) that glass is tinted rather than blurred, since a blur over the moving
 * nebula re-runs on every frame. The recommended card is lit instead (PlanLight, its own file since the sign-in card
 * took the same look), after a card on reflect.app the owner pointed to: dark, a faint grid, a light pooled along its
 * bottom edge, cells lighting and fading, a few stars and now and then a shooting star. Its tier tile and ticks are the
 * button's gold, the spark in its pill twinkles, and a glow breathes slowly beneath it (a gradient, not a blur
 * filter, which cost a full re-blur every frame). It was tinted purple all over before that, at the owner's request.
 * The cards once carried a badge beside the name and a sheen sweeping across them; the owner asked for a more
 * professional look, and the sheen and the badge's glow went with every other shining edge.
 *
 * Nothing moves until the caller marks the card landed (data-landed): then its price counts up from zero - on a timer
 * that reads elapsed time rather than animation frames, which a background tab stops firing, so a price can never be
 * left stuck part-way, or at zero - over COUNT_MS, its feature list ticks in line by line and its light rises. Every
 * card lifts under the pointer with a soft glare following the cursor across it; the recommended one also leans a
 * couple of degrees towards the pointer (TILT, motion.ts's tiltToPointer) and settles back when it leaves. Under
 * reduced motion prices are shown in full and nothing breathes, twinkles or leans.
 *
 * The two refs are the caller's handles for its entrance: cellRef on the grid cell, which never moves, so it can be
 * measured; popRef on the wrapper the entrance moves, so the card's own hover lift stays separate from it.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Building2, Check, Layers, Sparkles, Sprout, Zap } from "lucide-react";
import { cardPrice, planFeatures, planPriceLabel } from "@/lib/billing";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlanLight } from "./PlanLight";
import { followPointer, releaseTilt, tiltToPointer, usePrefersReducedMotion } from "./motion";

const COUNT_MS = 650;
const TIER_ICONS = [Sprout, Zap, Building2];
const TILT = 2;

function useCountUp(target: number, start: boolean) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    if (!start) return;
    const begin = performance.now();
    const timer = window.setInterval(() => {
      const progress = Math.min(1, Math.max(0, (performance.now() - begin) / COUNT_MS));
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress >= 1) window.clearInterval(timer);
    }, 30);
    return () => window.clearInterval(timer);
  }, [target, start, reduced]);

  return value;
}

function Price({ plan, start }: { plan: Plan; start: boolean }) {
  const text = cardPrice(plan);
  const match = text.match(/^(\D*)([\d,]+)(.*)$/);
  const amount = match ? Number(match[2].replace(/,/g, "")) : 0;
  const counted = useCountUp(amount, start && Boolean(match));

  return (
    <p className="mt-5 flex items-baseline" aria-label={planPriceLabel(plan)}>
      {match?.[1] && <span className="mr-1 self-start pt-1 font-display text-[21px] font-medium leading-none text-foreground/70">{match[1]}</span>}
      <span className="font-display text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
        {match ? `${counted.toLocaleString("en-IN")}${match[3]}` : text}
      </span>
      {plan.billingInterval && !plan.isFree && <span className="ml-2 text-[14px] text-muted-foreground">/ {plan.billingInterval}</span>}
    </p>
  );
}

export function PlanCard({ plan, featured, order, landed, columns = "lg", cellRef, popRef, children }: {
  plan: Plan;
  featured: boolean;
  order: number;
  landed: boolean;
  columns?: "lg" | "xl";
  cellRef?: (node: HTMLDivElement | null) => void;
  popRef?: (node: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const Icon = TIER_ICONS[order] ?? Layers;

  return (
    <div ref={cellRef} className={cn("relative", featured && "z-10", featured && (columns === "xl" ? "xl:-my-4" : "lg:-my-4"))}>
      <div ref={popRef} data-landed={landed} className="plan-pop relative h-full">
        {featured && <span aria-hidden="true" className="plan-halo pointer-events-none absolute -inset-x-8 -bottom-12 top-1/2 rounded-full" />}
        <div
          onPointerMove={featured ? (event) => tiltToPointer(event, TILT) : followPointer}
          onPointerLeave={featured ? releaseTilt : undefined}
          className={cn("plan-card relative flex h-full flex-col rounded-[22px]", featured && "plan-card-featured")}
        >
          {featured && <PlanLight landed={landed} />}
          <span aria-hidden="true" className="plan-glare pointer-events-none absolute inset-0 rounded-[inherit]" />
          {featured && (
            <p className="plan-flag absolute left-1/2 top-0 z-10 flex h-[30px] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full pl-3 pr-3.5 text-[12.5px] font-semibold tracking-[-0.005em]">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              Most popular
            </p>
          )}
          <div className={cn("relative flex flex-1 flex-col p-5 sm:p-6", featured && "pt-9 sm:pt-10", featured && (columns === "xl" ? "xl:py-11" : "lg:py-11"))}>
            <div className="flex items-center gap-3">
              <span className={cn("plan-tier grid h-9 w-9 shrink-0 place-items-center rounded-[11px]", featured && "plan-tier-featured")}>
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
              </span>
              <h3 className="font-display text-[21px] font-semibold tracking-tight">{plan.name}</h3>
            </div>
            {plan.tagline && <p className="mt-3.5 min-h-[2.8rem] text-[14px] leading-[1.6] text-foreground/65">{plan.tagline}</p>}

            <Price plan={plan} start={landed} />

            <span aria-hidden="true" className={cn("mt-6 block h-px", featured ? "bg-white/[0.12]" : "bg-white/[0.07]")} />

            <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground/80">Includes</p>
            <ul className="mt-3 flex-1 space-y-2">
              {planFeatures(plan).map((feature, index) => (
                <li key={feature} className="plan-feature flex items-start gap-3 text-[14px] leading-snug text-foreground/85" style={{ "--f": index } as CSSProperties}>
                  <span className={cn("mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full", featured ? "plan-tick-featured" : "bg-primary/[0.14] text-primary")}>
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
