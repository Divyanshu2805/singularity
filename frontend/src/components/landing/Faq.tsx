/**
 * The landing page's questions and answers.
 *
 * Handles: the section's intro (SectionIntro, the pattern every section shares), set in a left column beside the
 * questions on a wide screen, the column staying in view while the list scrolls past it when the screen is tall
 * enough to hold it (a single centred list left most of a wide page empty); under the intro a card leading to
 * sign-up (AskCard); and on the right the questions themselves, as one list. The section is held a little narrower
 * than the page's container (82.5rem), as the hero's card is: the owner asked for both to be a bit less wide.
 *
 * The section sits well below the plans and close to the footer's black hole, both at the owner's request: its bottom
 * margin is negative, so the empty sky at the top of the hole's canvas lies behind the last questions instead of
 * holding them apart from the glow, and the section is stacked above the footer (z-10) so those questions stay
 * clickable and in front of it.
 *
 * The questions come in with the scroll rather than on a timer, falling into place at their full size: the first
 * row drops a short way from above (DROP), and every other row starts tucked behind the row before it - only PEEK of
 * its lower edge showing, dimmer the further down that stack it is (DIM) - then falls straight down from under that
 * row into its own place as that place travels up from the bottom edge of the screen (START, TRAVEL), slowly at first
 * and gathering speed, as a thing dropped does (FALL), the ease behind it softening the landing. The tucked rows were
 * a little narrower for each place down the stack and the first row grew as it rose; the owner asked for the rows to
 * fall and not be small, so nothing is scaled any more. So the rows still to come ride along under the last
 * one out, as the features' deck keeps its cards, and each is seen through the frosted glass of the row it leaves. A
 * row's offset is the sum of every tuck above it, which is what keeps the stack together; the rows are measured by
 * the untransformed cells that hold them, so an answer opening mid-way simply moves the places. Each row chases the
 * scroll with a short ease (FOLLOW_MS) and goes back under the same way when the page is scrolled up - the plans'
 * cards do the same, and the owner liked motion that reverses. Earlier rows are stacked above later ones only while
 * posed. This replaced each row simply rising 38px over the bottom sixth of the screen, which the owner asked to have
 * bettered: it was over before the row was far enough up to be looked at. Its pace has been tuned both ways since -
 * slower and smoother while the rows still slid out (0.42 of a screen, a 190ms ease), then faster once they fell - so
 * a row now falls over TRAVEL of a screen on a short ease (FOLLOW_MS). The first row is fully opaque well before
 * it finishes moving (APPEAR) and no row is ever hidden from the keyboard, so tabbing to a question below the screen
 * brings it into view already in place. The loop runs only while the list is near the screen, writes straight to each row, and
 * a row at rest carries no transform. If frames have stalled (a tab coming back from the background) it jumps to
 * where the scroll is instead of finishing a movement nobody saw start.
 *
 * Opening an answer, one at a time: the row's glass takes an ember tint, a soft gold glow comes up along its left
 * edge (fading out towards the row's top and bottom, and showing faintly under the pointer on a closed row), the
 * tile with the question's icon fills with the button's gold, the plus folds into a minus, the answer's height
 * eases open (grid-template-rows 0fr to 1fr, which needs no measuring), and the answer arrives a word at a time, the
 * way a reply streams into the app's chat. Under the pointer a row's border lifts, a soft glare follows the cursor,
 * its question eases a few pixels right and its toggle lights; pressing sinks the row a fraction. The rows were
 * opaque boxes numbered in mono with a glowing gold shadow when open; they are glass now, so the sky shows through,
 * and the open one is marked by colour instead of a glow, like the recommended plan.
 *
 * Four things were tried with this and taken out at the owner's request, so don't bring them back unasked: a hard
 * violet bar down the open row's left edge (the owner wanted a glow in that edge instead of a line); an index
 * of topics in the left column, with the navigation's glass chip gliding to the open question's topic; the questions
 * split into those topics, each under a small label and a hairline (the owner wanted every question together); and a
 * row under each answer of its facts as small chips with a link to the part of the page that shows them.
 *
 * The sign-up card carries the horizon mark, which builds itself each time the card comes on screen, and types
 * example ideas into a replica of the prompt box, one after another, while it is there (use-typewriter-placeholder,
 * which the app's own empty prompt uses); the replica is a pointer shortcut to sign-up and is hidden from the keyboard
 * and screen readers, which have the card's LandingButton.
 *
 * The home page (pages/Home.tsx) shows this section with a list of its own (questions - landing/questions.ts),
 * without the sign-up card (aside = false: that page closes on a prompt of its own instead) and without the tuck
 * under the footer (tucked = false: it has no black hole to sit against, so the section keeps ordinary space below
 * it). With no arguments it is the first landing page's section, unchanged.
 *
 * Each question is a real button with aria-expanded and aria-controls over a labelled region; the arrow keys, Home
 * and End move between questions, and keyboard focus is shown as a ring round the whole row, following its rounding
 * (a ring on the button alone cut a square across the open row). A closed answer is hidden from assistive technology, but its text stays in the page
 * for search engines rather than being rendered only when opened. Every answer describes something the app does
 * today - the stack the starter template uses, where generated code runs, the three project roles, the ZIP download,
 * the daily allowance, the two sign-in methods with two-factor, and cancelling at the end of the billing period.
 * Under reduced motion nothing is posed or typed: the rows are simply there and open without easing.
 */
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Boxes, Container, CreditCard, Gauge, GraduationCap, PackageOpen, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { HorizonMark } from "@/components/HorizonMark";
import { SlideLink } from "@/components/SlideLink";
import { useTypewriterPlaceholder } from "@/hooks/use-typewriter-placeholder";
import { cn } from "@/lib/utils";
import { LandingButton } from "./LandingButton";
import { Reveal } from "./Reveal";
import { SectionIntro } from "./SectionIntro";
import { followPointer, useInView, usePrefersReducedMotion } from "./motion";

export type Question = { icon: LucideIcon; q: string; a: string };

const QUESTIONS: Question[] = [
  {
    icon: Boxes,
    q: "What does Singularity actually build?",
    a: "Real web apps. You describe an idea, answer four quick questions, and the AI writes a React, Vite and Tailwind project for you file by file in a chat. Then keep asking for changes until it's what you wanted.",
  },
  {
    icon: GraduationCap,
    q: "Do I need to know how to code?",
    a: "No. Everything happens through the chat and the live preview. If you want to learn along the way, switch on teaching mode for plain-English notes on the code, or ask ExplainLLM why any line works.",
  },
  {
    icon: Container,
    q: "Where does my code run?",
    a: "Only inside an isolated preview pod of its own on Kubernetes, never on our servers. The AI writes files and nothing else, and the pod is shut down once it sits idle.",
  },
  {
    icon: PackageOpen,
    q: "Can I take my code with me?",
    a: "Yes. Download the whole project as a ZIP whenever you like and run it anywhere. It's a normal project with its own package.json, so there's no lock-in.",
  },
  {
    icon: Users,
    q: "Can I build with other people?",
    a: "Invite people by email as an editor or a viewer. Editors can change the project and use the chat, viewers can open it and watch the preview, and only you as the owner can invite or manage members.",
  },
  {
    icon: ShieldCheck,
    q: "How do I sign in, and is my account safe?",
    a: "Sign in with Google or with email and a password. You can add an authenticator app for two-factor, see recent security events, and sign out of every device at once.",
  },
  {
    icon: Gauge,
    q: "What happens when I run out of tokens?",
    a: "Each plan has a daily AI allowance and a project limit, enforced by the server. The allowance refills every day, and the usage page shows exactly where it went. Need more? Move up a plan.",
  },
  {
    icon: CreditCard,
    q: "Can I cancel my plan?",
    a: "Any time, from billing settings. You keep your paid plan until the end of the period you've paid for, then move to the free plan. Projects beyond the free limit stay — you just can't create new ones.",
  },
];

const IDEAS = [
  "A reading log for my book club",
  "A tip splitter for group dinners",
  "A recipe box that scales servings",
  "A study planner for exam week",
  "A portfolio for my photography",
];

const START = 1;
const TRAVEL = 0.26;
const MIN_TRAVEL = 170;
const DROP = 38;
const PEEK = 9;
const DIM = 0.4;
const FALL = 1.8;
const APPEAR = 2.4;
const FOLLOW_MS = 120;
const STALLED_MS = 250;
const CAUGHT_UP = 0.0005;
const AT_REST = 0.0005;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function rest(node: HTMLElement) {
  if (node.dataset.pose === undefined) return;
  delete node.dataset.pose;
  node.style.removeProperty("transform");
  node.style.removeProperty("opacity");
  node.style.removeProperty("z-index");
}

function pose(node: HTMLElement, y: number, opacity: number, order: number) {
  if (Math.abs(y) < AT_REST && 1 - opacity < AT_REST) {
    rest(node);
    return;
  }
  const next = `${y.toFixed(2)}|${opacity.toFixed(3)}`;
  if (node.dataset.pose === next) return;
  node.dataset.pose = next;
  node.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
  node.style.opacity = opacity.toFixed(3);
  node.style.zIndex = String(order);
}

function AskCard() {
  const reduced = usePrefersReducedMotion();
  const [ref, visible] = useInView<HTMLDivElement>({ once: false, threshold: 0.4, rootMargin: "0px" });
  const typed = useTypewriterPlaceholder(IDEAS, visible && !reduced);

  return (
    <div ref={ref} onPointerMove={followPointer} className="faq-ask relative overflow-hidden p-6 sm:p-7">
      <span aria-hidden="true" className="faq-glare" />
      <div className="relative flex items-start justify-between gap-4">
        <p className="font-display text-[21px] font-semibold tracking-tight">Still wondering?</p>
        <HorizonMark className="-mt-1 h-10 w-10" drawn={reduced || visible} />
      </div>
      <p className="relative mt-1 max-w-sm text-[14.5px] leading-[1.65] text-foreground/65">
        The quickest answer is to try it. Start on the free plan, describe an idea and watch it get built.
      </p>
      <SlideLink to="/signup" tabIndex={-1} aria-hidden="true" className="faq-prompt relative mt-5 flex items-center gap-2.5 px-3.5 py-3">
        <span className="font-semibold text-primary">›</span>
        <span className="min-w-0 flex-1 truncate text-[14.5px] text-foreground/85">
          {reduced ? IDEAS[0] : typed}
          <span className="faq-caret animate-cursor-blink motion-reduce:hidden" />
        </span>
      </SlideLink>
      <LandingButton to="/login" className="mt-5">
        Start building
      </LandingButton>
    </div>
  );
}

export function Faq({ questions = QUESTIONS, aside = true, tucked = true }: { questions?: Question[]; aside?: boolean; tucked?: boolean } = {}) {
  const [open, setOpen] = useState<number | null>(0);
  const reduced = usePrefersReducedMotion();
  const [listRef, near] = useInView<HTMLDivElement>({ once: false, threshold: 0, rootMargin: "40% 0px 40% 0px" });
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const ids = useId();

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const cells = Array.from(list.querySelectorAll<HTMLElement>("[data-rise]"));
    const nodes = cells.map((cell) => cell.firstElementChild as HTMLElement);

    if (reduced) {
      nodes.forEach(rest);
      return;
    }

    const place = (follow: (index: number, goal: number) => number) => {
      const line = window.innerHeight * START;
      const travel = Math.max(MIN_TRAVEL, window.innerHeight * TRAVEL);
      const slots = cells.map((cell) => cell.getBoundingClientRect());
      let shift = 0;
      let depth = 0;
      let lead = 1;
      slots.forEach((slot, index) => {
        const progress = follow(index, clamp01((line - slot.top) / travel));
        const tuck = 1 - Math.pow(progress, FALL);
        if (index === 0) {
          lead = clamp01(progress * APPEAR);
          shift = -tuck * DROP;
          pose(nodes[index], shift, lead, cells.length);
          return;
        }
        shift += tuck * (PEEK - (slot.bottom - slots[index - 1].bottom));
        depth += tuck;
        pose(nodes[index], shift, lead * clamp01(1 - Math.max(0, depth - 1) * DIM), cells.length - index);
      });
    };

    if (!near) {
      place((_, goal) => goal);
      return;
    }

    const pos = cells.map(() => Number.NaN);
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
  }, [near, reduced, listRef]);

  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = buttons.current.indexOf(event.target as HTMLButtonElement);
    if (at < 0) return;
    const last = questions.length - 1;
    const to = event.key === "ArrowDown" ? at + 1 : event.key === "ArrowUp" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (to < 0 || to > last || to === at) return;
    event.preventDefault();
    buttons.current[to]?.focus();
  };

  return (
    <section
      id="faq"
      className={cn(
        "landing-wrap relative z-10 grid max-w-[82.5rem] scroll-mt-24 gap-12 pt-16 sm:pt-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 xl:gap-24",
        tucked ? "-mb-16 pb-6 sm:-mb-20 sm:pb-8" : "pb-20 sm:pb-28"
      )}
    >
      <div className="faq-aside lg:self-start">
        <SectionIntro align="left" eyebrow="FAQ" title="Questions," accent="answered." />
        {aside && (
          <Reveal delay={140} className="mt-8 sm:mt-10">
            <AskCard />
          </Reveal>
        )}
      </div>

      <div ref={listRef} onKeyDown={onKeys} className="space-y-3">
        {questions.map((item, index) => {
          const expanded = open === index;
          const button = `${ids}-q${index}`;
          const panel = `${ids}-a${index}`;
          const Icon = item.icon;
          return (
            <div key={item.q} data-rise>
              <div data-open={expanded} onPointerMove={followPointer} className="faq-row">
                <span aria-hidden="true" className="faq-glare" />
                <h3>
                  <button
                    ref={(node) => {
                      buttons.current[index] = node;
                    }}
                    id={button}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panel}
                    onClick={() => setOpen(expanded ? null : index)}
                    className="flex w-full items-center gap-4 px-4 py-4 text-left focus-visible:outline-none sm:px-5"
                  >
                    <span aria-hidden="true" className="faq-tile">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </span>
                    <span className="faq-q flex-1 text-[16px] font-medium leading-snug tracking-[-0.008em] text-foreground sm:text-[17px]">{item.q}</span>
                    <span aria-hidden="true" className="faq-toggle">
                      <span className="faq-bar" />
                      <span className="faq-bar faq-bar-v" />
                    </span>
                  </button>
                </h3>
                <div id={panel} role="region" aria-labelledby={button} aria-hidden={!expanded} className="faq-panel grid">
                  <div className="overflow-hidden">
                    <div className="px-4 pb-5 pt-0.5 sm:pb-6 sm:pl-[4.75rem] sm:pr-7">
                      <p className="faq-answer max-w-[76ch] text-[15px] leading-[1.7] text-foreground/70">
                        {item.a.split(" ").map((word, order) => (
                          <span key={order} className="faq-word" style={{ "--w": order } as CSSProperties}>
                            {word}{" "}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
