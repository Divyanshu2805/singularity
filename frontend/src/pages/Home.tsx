/**
 * The home page: the public landing page laid out content first - every section and every line of copy in place on
 * the plain star sky, before the page is dressed in the app's theme.
 *
 * Handles: the page from top to bottom, in the order a visitor's questions come - the navigation pill (LandingNav,
 * the first landing page's, with a "Sign in" link added); the hero, which is the mark, the headline "Where an idea
 * instantly expands into an app." (the owner's wording), one line saying what the product does, the app's own prompt
 * as the call to action (IdeaPrompt - what is typed there is waiting in the dashboard after sign-up), a line saying
 * it is free to start, and the real project screen playing a build (AppGlassCard); how it works, as five steps round
 * a planet whose rim a falling comet lights, or a list beside the window on a narrow screen (HowItWorks); what you
 * can build, six ideas that each start a project (Examples); the two
 * ways the app explains its own work (Understand); the rest of the features in four chapters (FeatureChapters); the
 * plans (PlanShowcase, exactly as the first page has them, entrance included); the questions (Faq, with this page's
 * list); a closing call that is the prompt again; and the footer - the brand with one line, the page's and the
 * account's links, and the name set very large (FooterWordmark).
 *
 * What is deliberately absent: the nebula, the first page's planet rim and its beam, the fabric floor and the black
 * hole. The owner asked for the complete content on the star sky alone (LandingBackdrop) with the navigation as it
 * was, to be themed afterwards, one section at a time. No section has a band of background of its own; the footer's
 * only divider is a thin fading line. Only how it works pins the scroll: it is the second section to be themed, with
 * the first page's orbit brought back and a comet to light it (StepOrbit). That comet starts its fall while the foot
 * of the hero's project window is still on screen, so the window's wrapper stands in front of it (z-30): drawn over
 * the window, the comet read as a fault in the window rather than something in the sky behind it.
 *
 * The hero is the first section to be themed, to the idea the owner chose from four: "the idea is the singularity",
 * on the app's own sky. The app's breathing wash stands behind it and lets go as the hero scrolls away (HeroSky).
 * The copy stands on a sheet of space-time (HeroFabric - the sign-in page's fabric at the scale of a page), and the
 * prompt is the mass on it: the grid dips round the prompt, which opens on a spring once the prompt has arrived
 * (DIP_AT), a small steady light sits under it (home.css, .hero-ember) and a few stars on the sheet lean towards it.
 * Each time an idea goes out, one ripple leaves the prompt and crosses the sheet to the project window: the window's
 * film asks for one just before each of its requests (AppGlassCard's onPulse), and a soft glow answers at the
 * window's head as it arrives (.hero-arrive, played after the time the ripple takes to travel there at HeroFabric's
 * PULSE_SPEED, and only once there is a window for it to arrive at). A visitor's own typing does it too: the light
 * under the prompt grows with what they have written (--energy, full at FULL_ENERGY_AT characters) and smaller
 * ripples go out as they type, no more often than TYPE_PULSE_GAP_MS.
 *
 * The project window can be brought in by that sheet, which is switched off for now (SHEET_ENTRANCE): the owner saw
 * four versions of it in one evening and did not like how any of them came in, so until it is decided whether to
 * drop it the window opens with its own unroll, as it did before (AppGlassCard, entrance "own"). What the switch
 * turns on (the owner: "I want this animation to pop up and expand from a
 * square of a fabric when the page is loaded", then "realistic ... from small to large expanding in size and look
 * like as if we are zooming in but not actually zooming in"). Early in the opening sequence (GROW_AT) the square of
 * the grid under the middle of the window's top edge lights, and the sheet then zooms in on it: every line of the
 * grid streams out from that square, finer grids coming into view as it goes, and the real window, standing in the
 * square and no wider than it at first, is carried up to its own size by the same magnification (HeroFabric draws
 * the sheet and works out the zoom, lib/expansion.ts holds the arithmetic; the hero is handed the progress and the
 * zoom and puts them on the window with components/landing/expansion.ts's revealApp). The headline, the prompt and
 * the far stars do not move, so it reads as the view closing in on the sheet while the page stays where it is. It
 * takes about a second and runs alongside the copy arriving, as the window's own entrance always has. Once the
 * window has arrived it carries no transform, so its film is sharp, and the film starts as before, when the
 * sequence goes live, with the first ripple from the prompt arriving at it (FIRST_PULSE_AT). If the window is still
 * under the fold when the page loads, the zoom waits until the visitor has scrolled its top into view (SEED_SIGHT),
 * so it is always seen, and a ripple follows it in; a page that arrives without the opening sequence - a return by
 * the page slide, a reload part-way down - has the window whole from the start. Under reduced motion none of this
 * plays and the window simply stands there.
 *
 * The mark over the headline plays as an eclipse, a moon crossing a sun and leaving the logo at totality, again and
 * again (EclipseMark) - the owner asked for that once the rest of the hero was in - and the sheet curves under its
 * two bodies as they move, deepest under the moon (HeroFabric's mark, which is why the mark is wrapped in a ref
 * here).
 *
 * Motion is the content's own: each demo plays on the app's screens as before, and every card comes up into place
 * with the scroll and goes back when it is scrolled up (landing/scroll-rise.ts), which is the plans' entrance given to
 * the rest of the page. Section headings fade up once as they come into view (SectionIntro), as on the first page,
 * and none has a summary line under it.
 *
 * A load at the top of the page opens on the first page's clock (landing/intro.ts): the headline's words drop in,
 * the line, the prompt and the note under it rise in turn, the navigation drops, and the project screen unrolls and
 * starts its session once the sequence is over. The root carries data-intro, "playing" until then and "live" after,
 * which is what index.css holds the ambient loops back on. The hero's own beats (HEADLINE, COPY) start earlier than
 * the first page's, which waited for its nebula's light to break first.
 *
 * The copy is docs/landing-content-plan.md's, held to what the app does today. Three things that plan lists are not
 * on the page yet: captures of real generated apps on the example cards, and the footer's links to the source, a
 * privacy page and a terms page - none of which exist to link to.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { SlideLink } from "@/components/SlideLink";
import { AppGlassCard } from "@/components/landing/AppGlassCard";
import { EclipseMark } from "@/components/landing/EclipseMark";
import { Examples } from "@/components/landing/Examples";
import { Faq } from "@/components/landing/Faq";
import { FeatureChapters } from "@/components/landing/FeatureChapters";
import { FooterWordmark } from "@/components/landing/FooterWordmark";
import { HeadlineWords } from "@/components/landing/HeadlineWords";
import { HeroFabric, PULSE_SPEED, type FabricHandle } from "@/components/landing/HeroFabric";
import { HeroSky } from "@/components/landing/HeroSky";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { IdeaPrompt } from "@/components/landing/IdeaPrompt";
import { CONTENT_RISE, INTRO, IntroContext, WORD_DROP, useIntro, useIntroClock, useIntroReached, useIntroStagger } from "@/components/landing/intro";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { LandingNav, type NavLink } from "@/components/landing/LandingNav";
import { useInView, usePrefersReducedMotion, useSmoothScroll } from "@/components/landing/motion";
import { PlanShowcase } from "@/components/landing/PlanShowcase";
import { HOME_QUESTIONS } from "@/components/landing/questions";
import { Reveal } from "@/components/landing/Reveal";
import { SectionIntro } from "@/components/landing/SectionIntro";
import { Understand } from "@/components/landing/Understand";
import { revealApp } from "@/components/landing/expansion";
import type { Zoom } from "@/lib/expansion";
import { cn } from "@/lib/utils";
import "@/components/landing/home.css";

const NAV_LINKS: NavLink[] = [
  { label: "How it works", id: "workbench" },
  { label: "Examples", id: "examples" },
  { label: "Understand", id: "understand" },
  { label: "Features", id: "features" },
  { label: "Pricing", id: "pricing" },
  { label: "FAQ", id: "faq" },
];

const MARK_AT = 0;
const HEADLINE = { at: 200, for: 1000 };
const COPY = { at: 620, for: 800 };
const COPY_STEP = 120;

function HeroMark() {
  const start = useIntroReached(MARK_AT);

  return <EclipseMark start={start} className="mb-6 h-14 w-14 sm:mb-7 sm:h-[4.5rem] sm:w-[4.5rem]" />;
}

const DIP_AT = COPY.at + COPY_STEP + 260;
const SHEET_ENTRANCE = false;
const GROW_AT = 350;
const FIRST_PULSE_AT = INTRO.live - 760;
const SEED_SIGHT = "0px 0px -56px 0px";
const TYPE_PULSE = 0.32;
const TYPE_PULSE_GAP_MS = 520;
const FULL_ENERGY_AT = 36;
const ARRIVE: Keyframe[] = [
  { opacity: 0, scale: "0.86" },
  { opacity: 1, scale: "1", offset: 0.32 },
  { opacity: 0, scale: "1.1" },
];
const ARRIVE_MS = 1500;
const FORMED_AT = 0.985;
const FORMED_PULSE_GAP_MS = 1500;

function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const [windowRef, sighted] = useInView<HTMLDivElement>({ once: true, threshold: 0, rootMargin: SEED_SIGHT });
  const arriveRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const fabric = useRef<FabricHandle>(null);
  const typedAt = useRef(0);
  const sentAt = useRef(0);
  const intro = useIntro();
  const reduced = usePrefersReducedMotion();
  const expands = SHEET_ENTRANCE && !reduced;
  const ready = useIntroReached(GROW_AT);
  const grow = !intro || (ready && sighted);
  const [formed, setFormed] = useState(!expands || !intro);
  const formedNow = useRef(formed);
  const pulsed = useRef(false);
  const armed = useIntroReached(DIP_AT);
  const primed = useIntroReached(FIRST_PULSE_AT);
  useIntroStagger(headlineRef, "[data-word]", WORD_DROP, HEADLINE, INTRO.wordStep);
  useIntroStagger(copyRef, "[data-hero-rise]", CONTENT_RISE, COPY, COPY_STEP);

  const travel = useCallback(() => {
    const from = promptRef.current?.getBoundingClientRect();
    const to = windowRef.current?.getBoundingClientRect();
    return from && to ? (Math.max(0, to.top - (from.top + from.height / 2)) / PULSE_SPEED) * 1000 : 0;
  }, []);

  const send = useCallback(() => {
    fabric.current?.pulse(1);
    sentAt.current = performance.now();
    const glow = arriveRef.current;
    if (!formedNow.current || !glow || typeof glow.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    glow.animate(ARRIVE, { duration: ARRIVE_MS, delay: travel(), easing: "ease-out" });
  }, [travel]);

  const expand = useCallback(
    (progress: number, zoom: Zoom | null) => {
      const node = windowRef.current;
      if (node) revealApp(node, progress, zoom);
      const done = progress >= FORMED_AT;
      if (done === formedNow.current) return;
      formedNow.current = done;
      setFormed(done);
      if (done && pulsed.current && performance.now() - sentAt.current > FORMED_PULSE_GAP_MS) send();
    },
    [send]
  );

  useLayoutEffect(() => {
    if (expands) fabric.current?.expansion(intro ? 0 : 1);
  }, [expands, intro]);

  useEffect(() => {
    if (expands) return;
    const node = windowRef.current;
    if (node) revealApp(node, 1, null);
    formedNow.current = true;
    setFormed(true);
  }, [expands]);

  const typed = useCallback((length: number) => {
    promptRef.current?.style.setProperty("--energy", Math.min(1, length / FULL_ENERGY_AT).toFixed(2));
    const now = performance.now();
    if (length === 0 || now - typedAt.current < TYPE_PULSE_GAP_MS) return;
    typedAt.current = now;
    fabric.current?.pulse(TYPE_PULSE);
  }, []);

  useEffect(() => {
    if (!intro || !primed) return;
    pulsed.current = true;
    send();
  }, [intro, primed, send]);

  return (
    <section ref={sectionRef} className="relative overflow-x-clip pt-28 sm:pt-36">
      <HeroSky hero={sectionRef} />
      <HeroFabric ref={fabric} mass={promptRef} armed={armed} frame={expands ? windowRef : undefined} grow={grow} onExpand={expands ? expand : undefined} mark={markRef} />
      <div ref={copyRef} className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 text-center sm:px-8">
        <span ref={markRef} className="contents">
          <HeroMark />
        </span>
        <h1
          ref={headlineRef}
          className={cn(
            "text-balance pb-2 font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.025em] sm:text-[64px] lg:text-[76px]",
            !intro && "animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both"
          )}
        >
          <span className="sm:block">
            <HeadlineWords text="Where an idea instantly" />
          </span>{" "}
          <span className="sm:block">
            <HeadlineWords text="expands into an" />{" "}
            <em data-word className="heat-text -mb-[0.1em] inline-block animate-heat-sweep pb-[0.1em] pr-2 font-medium motion-reduce:animate-none">
              app.
            </em>
          </span>
        </h1>
        <p data-hero-rise className="mt-6 max-w-2xl text-balance text-[17px] leading-[1.6] text-foreground/70 sm:mt-7 sm:text-[19px]">
          Describe what you want. Singularity asks a few questions, writes the project file by file, and runs it live while you watch.
        </p>
        <div ref={promptRef} data-hero-rise className="relative isolate mt-9 w-full max-w-[44rem] sm:mt-10">
          <span aria-hidden="true" className="hero-ember" />
          <IdeaPrompt onType={typed} />
        </div>
        <p data-hero-rise className="mt-4 text-[13.5px] text-muted-foreground">
          Free to start. No card needed.
        </p>
      </div>

      <div className="landing-wrap relative z-30 mt-16 pb-10 sm:mt-20 sm:pb-12">
        <div ref={windowRef} className="relative mx-auto max-w-[82.5rem]">
          <span ref={arriveRef} aria-hidden="true" className="hero-arrive" />
          <AppGlassCard onPulse={send} entrance={expands ? "sheet" : "own"} playing={formed} />
        </div>
      </div>
    </section>
  );
}

function ClosingCall() {
  return (
    <section className="landing-wrap relative pb-24 pt-6 sm:pb-32 sm:pt-10">
      <SectionIntro eyebrow="Your turn" title="What will you" accent="build first?" />
      <Reveal delay={140} className="mx-auto mt-10 max-w-[44rem] sm:mt-12">
        <IdeaPrompt label="Describe the app you want to build first" />
      </Reveal>
    </section>
  );
}

const FOOTER_GROUPS: { name: string; links: { label: string; href?: string; to?: string }[] }[] = [
  {
    name: "Product",
    links: [
      { label: "How it works", href: "#workbench" },
      { label: "What you can build", href: "#examples" },
      { label: "Understand", href: "#understand" },
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    name: "Account",
    links: [
      { label: "Create an account", to: "/signup" },
      { label: "Sign in", to: "/login" },
    ],
  },
];

function Footer() {
  return (
    <footer className="relative overflow-hidden">
      <div aria-hidden="true" className="home-rule mx-auto w-[min(72rem,88%)]" />
      <div className="landing-wrap flex flex-col gap-10 pt-14 md:flex-row md:items-start md:justify-between">
        <Reveal className="max-w-sm">
          <span className="flex items-center gap-2.5">
            <HorizonMark className="h-8 w-8" />
            <BrandName className="text-[22px]" />
          </span>
          <p className="mt-3 text-[13.5px] leading-[1.65] text-muted-foreground">
            Describe an idea, answer a few questions, and watch a real project get built, run and explained.
          </p>
        </Reveal>
        <Reveal delay={90}>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-16 gap-y-8">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.name}>
                <p className="text-[13px] font-medium text-foreground/85">{group.name}</p>
                <ul className="mt-3 space-y-2.5 text-[13.5px] text-muted-foreground">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.to ? (
                        <SlideLink to={link.to} className="wipe-link">
                          {link.label}
                        </SlideLink>
                      ) : (
                        <a href={link.href} className="wipe-link">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </Reveal>
      </div>
      <FooterWordmark className="mt-10 sm:mt-12" />
    </footer>
  );
}

function Stage({ children }: { children: ReactNode }) {
  const live = useIntroReached(INTRO.live);

  return (
    <div data-intro={live ? "live" : "playing"} className="landing-page relative min-h-screen overflow-x-clip bg-background">
      {children}
    </div>
  );
}

export default function Home() {
  const intro = useIntroClock();
  useSmoothScroll();

  return (
    <IntroContext.Provider value={intro}>
      <Stage>
        <LandingBackdrop />
        <LandingNav links={NAV_LINKS} />
        <main className="relative">
          <Hero />
          <HowItWorks />
          <Examples />
          <Understand />
          <FeatureChapters />
          <PlanShowcase />
          <Faq questions={HOME_QUESTIONS} aside={false} tucked={false} />
          <ClosingCall />
        </main>
        <Footer />
      </Stage>
    </IntroContext.Provider>
  );
}
