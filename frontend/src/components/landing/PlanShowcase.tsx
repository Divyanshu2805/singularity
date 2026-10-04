/**
 * The landing page's plans: the live plans as three cards that come in with the scroll - the recommended one in the
 * middle rising into place first, and the other two then sliding out from behind it to either side, like a hand of
 * cards opening.
 *
 * Handles: the section's intro (SectionIntro, the pattern every section shares - heading only, the owner had the
 * line under it taken out along with the other sections'); loading the plans (the same query the pricing page uses,
 * so the two never disagree), a skeleton of three cards while they load, and if they can't load - which is what a
 * local frontend with no backend running always sees, since the plans come from account-service through the gateway
 * - a card saying so with a retry and a way on to the pricing page, rather than any plan written into the page;
 * turning the scroll position into each card's place (the loop in PlanShowcase and pose): the row's progress runs
 * from where its top enters near the bottom of the screen (START) over TRAVEL of a screen - shortened on a short
 * screen so the sequence has always finished by the place the row rests when the navigation's Pricing link lands on
 * the section (its scroll margin plus a little, LINKED_TOP), or that link would arrive at half-made cards. The
 * recommended card takes the first part of that (LEAD), coming up from a little below at nearly full size (RISE);
 * the outer cards take the rest (FAN), each starting behind the recommended card - moved across by the distance
 * between the two cards' centres, slightly small and a touch low (FAN_SCALE, FAN_Y) - and sliding out to its own
 * column. The recommended card sits above the others and is all but opaque, so they are hidden until they clear its
 * edge. Every card slows into place (GLIDE) and fades up early, and each chases the scroll with a short ease
 * (FOLLOW_MS) so a wheel's steps become one movement - unless the frames have stalled for STALLED_MS (a tab coming
 * back from the background, where frames barely fire), when it goes straight to where the scroll is rather than
 * finishing a movement nobody saw start. Scrolling back up takes them in the way they came out. Below the
 * three-column breakpoint (WIDE) the cards are stacked, so each simply rises as its own position comes up the
 * screen (SOLO, SOLO_TRAVEL).
 *
 * Before this the outer cards dropped in from above and the recommended one came last, scaling up from four fifths
 * of its size while it faded in; part-way down the scroll that left it small and dim between two finished cards, and
 * the owner read it as the card falling back and asked for a better idea. Whatever replaces this, the recommended
 * card should lead.
 *
 * A card is marked for good (data-landed) once it is LANDED of the way in - opaque and all but in place - rather than
 * when its chase finally comes to rest, which trailed the card by most of a second on top of a late scroll position:
 * the owner found the numbers and lists "very slow and late" and sometimes scrolled past the section before they
 * showed. Marking it is what sets off the card's price count, feature list and light (PlanCard, shared with the
 * pricing page, which owns the card's layout, looks and pointer behaviour).
 *
 * The row is held to a width of its own (1180px, and one card's width when the cards stack) rather than the page's
 * full container, and the cards' type and spacing were taken down a step: the owner asked for the cards to be a bit
 * smaller.
 *
 * Each card's call to action is the page's own LandingButton and leads to sign-up by the page slide: the page's dark
 * primary pill on the recommended card, the same one as "Start building" everywhere else, and its quieter twin
 * ("quiet") on the others, which used to carry the glass one and which the owner wanted to match each other. The
 * recommended card carried a pill filled with violet ("solid") while it was purple; the owner then asked for the
 * buttons to match the rest of the page. The retry is the glass one, and the links on to the pricing page underline
 * themselves from the left (.wipe-link).
 *
 * Which card is recommended and what each card lists come from lib/billing (isRecommended, planFeatures), shared with
 * the pricing page, so every number is the plan's own from the server and the highlight follows the same rule in both
 * places - the first paid plan, which is the middle of the three. Every button here leads to sign-up: this page is
 * only ever seen signed out, and checkout needs an account. The Stripe test-mode line under the cards follows the same
 * build-time flag as PaymentsTestModeNotice, so a live-payments build never claims test mode.
 *
 * Per-frame values are written straight to each card (transform, opacity, visibility) from one animation-frame loop
 * that runs only while the row is near the screen; when it is not, the cards are set once to where the scroll leaves
 * them. A card at rest has no transform at all, so its type is drawn sharp. React re-renders only when a card lands.
 * Under reduced motion nothing is posed: the cards are simply there, prices shown in full, with nothing breathing,
 * twinkling, leaning or crossing the sky - the recommended card's light, cells and stars are shown still.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCw } from "lucide-react";
import { usePlans } from "@/hooks/use-billing";
import { isRecommended } from "@/lib/billing";
import { PAYMENTS_TEST_MODE } from "@/lib/payments-mode";
import { cn } from "@/lib/utils";
import { LandingButton } from "./LandingButton";
import { PlanCard } from "./PlanCard";
import { SectionIntro } from "./SectionIntro";
import { useInView, usePrefersReducedMotion } from "./motion";

type Phase = { from: number; for: number };
type Start = { x: number; y: number; scale: number; appear: number };

const WIDE = "(min-width: 1024px)";
const START = 0.9;
const TRAVEL = 0.56;
const MIN_TRAVEL = 120;
const LINKED_TOP = 120;
const SOLO_TRAVEL = 0.36;
const LEAD: Phase = { from: 0, for: 0.6 };
const FAN: Phase = { from: 0.3, for: 0.7 };
const WHOLE: Phase = { from: 0, for: 1 };
const RISE: Start = { x: 0, y: 72, scale: 0.94, appear: 2.6 };
const SOLO: Start = { x: 0, y: 56, scale: 0.96, appear: 2.6 };
const FAN_Y = 22;
const FAN_SCALE = 0.9;
const FAN_APPEAR = 5;
const GLIDE = 2.2;
const FOLLOW_MS = 130;
const STALLED_MS = 250;
const CAUGHT_UP = 0.0005;
const LANDED = 0.55;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const span = (value: number, phase: Phase) => clamp01((value - phase.from) / phase.for);

function pose(card: HTMLElement, progress: number, from: Start) {
  const settle = 1 - Math.pow(1 - progress, GLIDE);
  const x = (1 - settle) * from.x;
  const y = (1 - settle) * from.y;
  const scale = from.scale + (1 - from.scale) * settle;
  const opacity = clamp01(progress * from.appear);

  const move = progress >= 1 ? "none" : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  const next = `${move}|${opacity.toFixed(3)}`;
  if (card.dataset.pose === next) return;
  card.dataset.pose = next;
  card.style.transform = move;
  card.style.opacity = opacity.toFixed(3);
  card.style.visibility = opacity > 0 ? "visible" : "hidden";
}

function rest(card: HTMLElement) {
  delete card.dataset.pose;
  card.style.removeProperty("transform");
  card.style.removeProperty("opacity");
  card.style.removeProperty("visibility");
}

function Skeleton() {
  return (
    <div className="mx-auto grid max-w-[440px] gap-5 lg:max-w-[1180px] lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="plan-card h-[450px] animate-pulse rounded-[22px] p-7">
          <span className="block h-10 w-32 rounded-xl bg-white/[0.06]" />
          <span className="mt-10 block h-12 w-36 rounded bg-white/[0.06]" />
          {[0, 1, 2, 3].map((row) => (
            <span key={row} className="mt-5 block h-3 w-3/4 rounded bg-white/[0.05]" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PlanShowcase() {
  const { data: plans = [], isLoading, isFetching, error, refetch } = usePlans();
  const reduced = usePrefersReducedMotion();
  const [stageRef, near] = useInView<HTMLDivElement>({ once: false, threshold: 0, rootMargin: "40% 0px 40% 0px" });
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const pops = useRef<(HTMLDivElement | null)[]>([]);
  const [landed, setLanded] = useState<boolean[]>([]);
  const settled = useRef<boolean[]>([]);

  const featured = plans.map((plan) => isRecommended(plan, plans));
  const shape = featured.join();

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const roles = shape ? shape.split(",").map((flag) => flag === "true") : [];
    if (!stage || roles.length === 0) return;

    const land = (index: number) => {
      if (settled.current[index]) return;
      settled.current[index] = true;
      setLanded(roles.map((_, order) => Boolean(settled.current[order])));
    };

    if (reduced) {
      roles.forEach((_, index) => {
        const card = pops.current[index];
        if (card) rest(card);
        land(index);
      });
      return;
    }

    const wide = window.matchMedia(WIDE);
    const lead = roles.indexOf(true);
    const centre = (cell: HTMLElement) => cell.offsetLeft + cell.offsetWidth / 2;

    const place = (follow: (index: number, goal: number) => number) => {
      const line = window.innerHeight * START;
      const top = stage.getBoundingClientRect().top;
      const linked = top - (stage.parentElement?.getBoundingClientRect().top ?? top) + LINKED_TOP;
      const rowAt = (line - top) / Math.max(MIN_TRAVEL, Math.min(window.innerHeight * TRAVEL, line - linked));
      const hub = wide.matches && lead >= 0 ? cells.current[lead] : null;
      roles.forEach((isFeatured, index) => {
        const card = pops.current[index];
        const cell = cells.current[index];
        if (!card || !cell) return;
        const goal = hub
          ? span(rowAt, isFeatured ? LEAD : FAN)
          : span((line - cell.getBoundingClientRect().top) / (window.innerHeight * SOLO_TRAVEL), WHOLE);
        const from = !hub ? SOLO : isFeatured ? RISE : { x: centre(hub) - centre(cell), y: FAN_Y, scale: FAN_SCALE, appear: FAN_APPEAR };
        const at = follow(index, goal);
        pose(card, at, from);
        if (at >= LANDED) land(index);
      });
    };

    if (!near) {
      place((_, goal) => goal);
      return;
    }

    const pos = roles.map(() => Number.NaN);
    let frame = 0;
    let then = 0;
    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      const elapsed = then ? now - then : 16;
      then = now;
      const carry = elapsed > STALLED_MS ? 0 : Math.exp(-elapsed / FOLLOW_MS);
      place((index, goal) => {
        const eased = Number.isNaN(pos[index]) ? goal : goal + (pos[index] - goal) * carry;
        pos[index] = Math.abs(eased - goal) < CAUGHT_UP ? goal : eased;
        return pos[index];
      });
    };
    place((index, goal) => (pos[index] = goal));
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [shape, reduced, near, stageRef]);

  return (
    <section id="pricing" className="landing-wrap relative scroll-mt-24 pb-28 pt-10 sm:pb-36">
      <SectionIntro eyebrow="Pricing" title="Start free." accent="Grow when it clicks." />

      <div ref={stageRef} className="plan-stage mt-16 sm:mt-24">
        {isLoading ? (
          <Skeleton />
        ) : error || plans.length === 0 ? (
          <div className="plan-card mx-auto flex max-w-md flex-col items-center gap-4 rounded-[22px] px-6 py-8 text-center">
            <p className="text-[15px] leading-6 text-muted-foreground">The plans couldn&apos;t load just now.</p>
            <div className="flex items-center gap-3">
              <LandingButton
                variant="ghost"
                size="sm"
                arrow={false}
                onClick={() => void refetch()}
                disabled={isFetching}
                leading={<RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />}
              >
                Try again
              </LandingButton>
              <Link to="/pricing" className="wipe-link text-[12.5px] text-muted-foreground">
                See pricing
              </Link>
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-[440px] items-stretch gap-5 lg:max-w-[1180px] lg:grid-cols-3">
            {plans.map((plan, position) => (
              <PlanCard
                key={plan.id ?? plan.name}
                plan={plan}
                featured={featured[position]}
                order={position}
                landed={Boolean(landed[position])}
                cellRef={(node) => {
                  cells.current[position] = node;
                }}
                popRef={(node) => {
                  pops.current[position] = node;
                }}
              >
                <LandingButton to="/signup" variant={featured[position] ? "primary" : "quiet"} block>
                  {plan.isFree ? "Start for free" : `Choose ${plan.name}`}
                </LandingButton>
              </PlanCard>
            ))}
          </div>
        )}
      </div>

      {plans.length > 0 && (
        <p className="mt-14 text-center text-[13.5px] text-muted-foreground">
          {PAYMENTS_TEST_MODE && "Payments are in Stripe test mode — no real money moves. "}
          <Link to="/pricing" className="wipe-link text-primary">
            Compare every plan
          </Link>
        </p>
      )}
    </section>
  );
}
