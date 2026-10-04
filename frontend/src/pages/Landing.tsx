/**
 * The public landing page, shown at the root to anyone who isn't signed in.
 *
 * Handles: the floating glass navigation pill - narrowing and
 * darkening once scrolled, with the horizon mark (HorizonMark) alone as its brand - the name was moved out of the pill
 * and set large beside the hero's mark at the owner's request - which builds itself on load, rebuilds on
 * hover and floats in a breathing glow, section links set in the reading face like the rest of the app, that show
 * where the visitor is (a frosted glass chip outlined in the button's gold - a pale sheen and a soft inner tint, no gold fill - glides to the section being read, from motion.ts's useActiveSection, a
 * fainter pill glides after the pointer across the links, and a pressed link sinks with that pill), and a "Start
 * building" button (LandingButton) that leaves for sign-up by the
 * page slide - the hero, headed by the app's mark and name building themselves over the line "Where an idea instantly expands into
 * an app." (the owner's wording, which replaced "Say what you want. Watch it get built."), over a nebula that fills
 * the whole background (HeroNebula) and a glass pane of the real project screen standing in front of its glowing
 * heart - then "How it works" under a planet's rim (HorizonArc) that lights as the page scrolls and
 * pours a beam into the workbench demo, and once the beam reaches it the stage tiles slide out from
 * behind it, left, right and below, each lighting up and replaying its own stage while the workbench is on that stage
 * - the build orbit, whose ring is the rim of a second planet, mirrored just below it as a soft, blurred reflection
 * (PlanetReflection, after reflect.app's sphere) behind the features' heading - the feature fabric (FeatureFabric), where each chapter's glass card - Build, Run, Understand, Share, Own, with that chapter's demos side by side - comes up from the bottom, over a grid of space-time and into a column of light, to the front of a deck of the chapters before it (or, on a small screen, FeatureDeck, where the features stack up chapter by chapter as working
 * cards), the plans (PlanShowcase), the outer two dropping in from above with the scroll and the recommended one
 * coming forward out of the row between them, the questions and
 * answers (Faq), and the footer: the brand, the page's and the account's links fading up in turn (each underlining
 * itself from the left under the pointer, .wipe-link, and the account's links leaving by the page slide), under a
 * second black hole standing on the footer's top edge (FooterHole, after the one that closes reflect.app's home page)
 * with bands of light flowing out through its dome, and over the name set very large, rising out of a line of light as
 * the visitor scrolls to the end of the page (FooterWordmark) - the same line the intro opens the hero's black hole
 * from; it was taken out when the footer's hole went in and put back at the owner's request. The footer used to end
 * in a copyright line with a small "Start building" link beside it; the owner had that row taken out, so the name is
 * the last thing on the page.
 *
 * The section highlight holds on a link that was just clicked while the page scrolls to it, rather than stepping
 * through every section on the way, until that section is reached, the visitor takes the scroll back (wheel, touch or
 * key) or PICK_HOLD_MS passes. Both pills are placed (motion.ts's placeMarker) from the links' own offsets, written as custom properties on the
 * pill, so gliding between links is a CSS transition; a pill that is appearing is placed without one (data-snap) and
 * fades in where it lands instead of sliding in from wherever it last was. They are re-placed when the links' size
 * changes, as when the web font arrives.
 *
 * Four sections that once followed the orbit - the build-log ticker, the bench of features a jet of light ran through,
 * where generated code runs and the gold-aurora call to action - were taken out (2026-10-03) rather than left parked:
 * each carried its own band of background or a border, which broke the one continuous sky, and none was rendered.
 * Anything brought back should sit straight on the sky, as the footer does - its only divider is a thin fading light,
 * not a border or a band of its own.
 *
 * A load at the top of the page opens with the intro sequence (landing/intro.ts): the page creates its one clock and
 * provides it through IntroContext, and the nebula, the sky, the card, the headline's words, the navigation pill
 * and its items, and the brand's self-drawing mark each take their cue from it - the nebula's light spreads out from
 * its heart first, then the card opens downwards from its top edge just under it (AppGlassCard), the headline drops in from above word by word and the
 * navigation follows it down, each on its own beat. The page's root carries data-intro, "playing" until the sequence reaches INTRO.live and "live"
 * after, which holds the ambient loops (the card's edge glints, the call to action's sheen) back until the page is
 * made. Every headline word is its own piece with its own gradient text (HeadlineWords), so each can drop on its own
 * beat. The card opens in place rather than moving, so the box HeroNebula measures to place its heart is where the card
 * already rests.
 *
 * The workbench section owns the refs that join its two halves: HorizonArc draws its rim under the heading and its
 * beam down to the stage, and the stage opens when its top crosses a viewport line (POUR_LINE), which is the scroll
 * position HorizonArc times the beam's arrival to, so the tiles appear exactly as the beam lands. The hero's nebula
 * spans the full width from the top of the page to past the hero's foot, behind the headline (which sits above it at
 * z-10), and fades out at both ends rather than being cut off at the canvas's edge. Until 2026-10-03 the hero was a
 * gold black hole with stars falling into it, the card raised by part of its radius to overlap the hole's lower part,
 * as reflect.app's window does; the owner asked for a nebula in the whole background instead. Opening is one data-open attribute and CSS
 * transitions, set once and never removed, so the tiles stay once they have arrived; the light itself follows the
 * scroll both ways, drawing back up the way it came when the visitor scrolls up. The light used to pour from the
 * hero itself, down the card's sides and on to the stage, until the owner swapped it for the planet's rim.
 *
 * The sections sit in .landing-wrap (index.css), one fluid container shared by the nav, the hero card, the features,
 * the plans, the questions and the footer: it grows with the screen up to 97.5rem, inside side gutters that scale
 * with the viewport (--gutter), so wide screens are filled rather than framed by empty margins. Headings and
 * paragraphs keep narrower caps of their own, so their lines stay a readable length however wide the page gets, and
 * three things are held narrower than the container at the owner's request: the hero's card and the questions
 * (82.5rem each) and the row of plans (PlanShowcase's own cap).
 *
 * Scrolling is eased by Lenis (motion.ts's useSmoothScroll) while the page is mounted. Scroll-linked motion writes CSS
 * variables from one animation-frame-batched listener per section rather than through React state, so scrolling never
 * re-renders a section. The palette is the app's own - charcoal ink, one gold light,
 * the logo's spark scattered through the sky - with Fraunces for the voice, Inter for everything a visitor reads, and
 * JetBrains Mono for everything the machine says: the replica of the app, the demos, code, and the small uppercase
 * labels. The page wraps itself in .landing-page, which lightens the text tokens and switches the reading face for
 * the landing page alone, leaving the app's own terminal look untouched - mono body copy at 11 to 13px in a 58%
 * grey read as murky across the page. Every claim on it is something the app does today; the
 * sections that demonstrate a feature borrow the app's own step names and roles rather than paraphrasing them.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SlideLink } from "@/components/SlideLink";
import { LandingButton } from "@/components/landing/LandingButton";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { BuildOrbit } from "@/components/landing/BuildOrbit";
import { AppGlassCard } from "@/components/landing/AppGlassCard";
import { HeroNebula } from "@/components/landing/HeroNebula";
import { HorizonArc } from "@/components/landing/HorizonArc";
import { FeatureFabric } from "@/components/landing/FeatureFabric";
import {
  INTRO,
  IntroContext,
  ITEM_DROP,
  NAV_DROP,
  WORD_DROP,
  useIntro,
  useIntroClock,
  useIntroEntrance,
  useIntroReached,
  useIntroStagger,
} from "@/components/landing/intro";
import { Faq } from "@/components/landing/Faq";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { PlanShowcase } from "@/components/landing/PlanShowcase";
import { placeMarker, useActiveSection, useSmoothScroll } from "@/components/landing/motion";
import { Reveal } from "@/components/landing/Reveal";
import { SectionIntro } from "@/components/landing/SectionIntro";
import { FooterHole } from "@/components/landing/FooterHole";
import { FooterWordmark } from "@/components/landing/FooterWordmark";
import { HeadlineWords } from "@/components/landing/HeadlineWords";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "How it works", id: "workbench" },
  { label: "Features", id: "features" },
  { label: "Pricing", id: "pricing" },
  { label: "FAQ", id: "faq" },
];

const SECTIONS = NAV_LINKS.map((link) => link.id);
const PICK_HOLD_MS = 2400;

const NAV_BRAND_AT = INTRO.nav.at + 150;
const NAV_ITEMS = { at: INTRO.nav.at + 110, for: 750 };

function NavBrand() {
  const [drawn, setDrawn] = useState(false);
  const rebuild = useRef<number>();
  const arrived = useIntroReached(NAV_BRAND_AT);

  useEffect(() => {
    if (!arrived) return;
    rebuild.current = window.setTimeout(() => setDrawn(true), 200);
    return () => window.clearTimeout(rebuild.current);
  }, [arrived]);

  const replay = () => {
    if (!drawn || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setDrawn(false);
    window.clearTimeout(rebuild.current);
    rebuild.current = window.setTimeout(() => setDrawn(true), 420);
  };

  return (
    <Link
      to="/"
      aria-label="Singularity home"
      onMouseEnter={replay}
      data-intro-item
      className="nav-brand group flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative inline-flex h-8 w-8 shrink-0">
        <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[70%] rounded-full" />
        <span className="nav-brand-float relative inline-flex h-full w-full">
          <HorizonMark className="h-full w-full" drawn={drawn} />
        </span>
      </span>
      <BrandName drawn={drawn} className="hidden text-[22px] sm:inline" />
    </Link>
  );
}

function NavSections() {
  const links = useRef<Record<string, HTMLAnchorElement | null>>({});
  const listRef = useRef<HTMLUListElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const spied = useActiveSection(SECTIONS);
  const [picked, setPicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = picked ?? spied;

  useEffect(() => {
    if (!picked) return;
    if (spied === picked) {
      setPicked(null);
      return;
    }
    const release = () => setPicked(null);
    const timer = window.setTimeout(release, PICK_HOLD_MS);
    const options = { passive: true } as const;
    window.addEventListener("wheel", release, options);
    window.addEventListener("touchstart", release, options);
    window.addEventListener("keydown", release);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      window.removeEventListener("keydown", release);
    };
  }, [picked, spied]);

  useLayoutEffect(() => placeMarker(activeRef.current, active ? links.current[active] : null), [active]);
  useLayoutEffect(() => placeMarker(hoverRef.current, hovered ? links.current[hovered] : null), [hovered]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      for (const marker of [activeRef.current, hoverRef.current]) {
        const id = marker?.dataset.for;
        if (marker?.dataset.shown === "true" && id) placeMarker(marker, links.current[id], true);
      }
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="nav-sections absolute left-1/2 hidden -translate-x-1/2 md:block" onPointerLeave={() => setHovered(null)}>
      <span ref={hoverRef} aria-hidden="true" data-for={hovered ?? undefined} className="nav-hover" />
      <span ref={activeRef} aria-hidden="true" data-for={active ?? undefined} className="nav-active" />
      <ul ref={listRef} className="flex items-center gap-0.5">
        {NAV_LINKS.map((link) => {
          const current = active === link.id;
          return (
            <li key={link.id} data-intro-item>
              <a
                ref={(node) => {
                  links.current[link.id] = node;
                }}
                href={`#${link.id}`}
                aria-current={current ? "true" : undefined}
                data-active={current}
                onPointerEnter={() => setHovered(link.id)}
                onFocus={() => setHovered(link.id)}
                onBlur={() => setHovered(null)}
                onClick={() => setPicked(link.id)}
                className="nav-link relative block rounded-full px-3.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useIntroEntrance(navRef, NAV_DROP, INTRO.nav);
  useIntroStagger(navRef, "[data-intro-item]", ITEM_DROP, NAV_ITEMS, INTRO.navStep);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className="landing-nav fixed inset-x-0 top-0 z-50 px-[var(--gutter)] pt-3 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:pt-4">
      <nav
        ref={navRef}
        data-scrolled={scrolled}
        className={cn(
          "nav-glass relative mx-auto flex h-14 w-full items-center gap-4 rounded-full pl-4 pr-2 transition-[max-width,background-color,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:pl-5",
          scrolled ? "max-w-4xl" : "max-w-[97.5rem]"
        )}
      >
        <NavBrand />
        <NavSections />
        <LandingButton to="/login" size="sm" data-intro-item className="ml-auto">
          Start building
        </LandingButton>
      </nav>
    </header>
  );
}

const HERO_MARK_AT = INTRO.headline.at - 200;

function HeroMark() {
  const drawn = useIntroReached(HERO_MARK_AT);

  return (
    <span className="mb-6 inline-flex items-center gap-4 sm:mb-7 sm:gap-5">
      <span className="relative inline-flex h-14 w-14 shrink-0 sm:h-[4.5rem] sm:w-[4.5rem]">
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute -inset-[55%] transition-opacity duration-1000", drawn ? "opacity-100" : "opacity-0")}
        >
          <span className="nav-brand-glow absolute inset-0 rounded-full" />
        </span>
        <HorizonMark className="relative h-full w-full" drawn={drawn} />
      </span>
    </span>
  );
}

function Hero() {
  const cardRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const intro = useIntro();
  useIntroStagger(headlineRef, "[data-word]", WORD_DROP, INTRO.headline, INTRO.wordStep);

  return (
    <section className="relative overflow-x-clip pt-24 sm:pt-28">
      <HeroNebula
        card={cardRef}
        className={cn("-bottom-[260px] left-1/2 top-0 w-screen -translate-x-1/2", !intro && "animate-in fade-in duration-1000")}
      />
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 text-center sm:px-8">
        <HeroMark />
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
            <em data-word className="heat-text inline-block animate-heat-sweep pb-[0.1em] -mb-[0.1em] pr-2 font-medium motion-reduce:animate-none">
              app.
            </em>
          </span>
        </h1>
      </div>

      <div className="landing-wrap relative -mt-6 pb-10 sm:-mt-8 sm:pb-12">
        <div className="h-[220px] sm:h-[364px]" />
        <div ref={cardRef} className="relative mx-auto max-w-[82.5rem]">
          <AppGlassCard />
        </div>
      </div>
    </section>
  );
}

function WorkbenchShowcase() {
  const headingRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  return (
    <section id="workbench" className="relative scroll-mt-10 overflow-x-clip pb-10 pt-24 sm:pt-32">
      <HorizonArc heading={headingRef} target={stageRef} />
      <div ref={headingRef} className="relative">
        <SectionIntro
          className="relative px-5 sm:px-8"
          eyebrow="How it works"
          title="From a sentence"
          accent="to something you can click."
        />
      </div>

      <div ref={stageRef} className="relative mx-auto mt-56 w-full px-5 sm:px-8 lg:mt-[22rem] lg:px-0">
        <BuildOrbit />
      </div>
    </section>
  );
}

function PlanetReflection() {
  return (
    <div aria-hidden="true" className="pointer-events-none relative h-40 sm:h-56">
      <div className="planet-reflection" />
    </div>
  );
}

const FOOTER_LINKS = [
  { label: "How it works", href: "#workbench" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Create an account", to: "/signup" },
  { label: "Sign in", to: "/login" },
];

function LandingFooter() {
  return (
    <footer className="relative overflow-hidden">
      <FooterHole />
      <div className="footer-panel">
        <div className="landing-wrap flex flex-col gap-8 pt-14 md:flex-row md:items-start md:justify-between">
          <Reveal className="max-w-sm">
            <span className="flex items-center gap-2.5">
              <HorizonMark className="h-8 w-8" />
              <BrandName className="text-[22px]" />
            </span>
            <p className="mt-3 text-[13.5px] leading-[1.65] text-muted-foreground">
              Describe an idea, answer four questions, and watch a real project get built, run and explained.
            </p>
          </Reveal>
          <Reveal delay={90}>
            <nav aria-label="Footer">
              <ul className="grid grid-cols-2 gap-x-12 gap-y-3 text-[13.5px] text-muted-foreground sm:grid-cols-3">
                {FOOTER_LINKS.map((link) => (
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
            </nav>
          </Reveal>
        </div>
        <FooterWordmark className="mt-8 sm:mt-10" />
      </div>
    </footer>
  );
}

function LandingStage({ children }: { children: ReactNode }) {
  const live = useIntroReached(INTRO.live);

  return (
    <div data-intro={live ? "live" : "playing"} className="landing-page relative min-h-screen overflow-x-clip bg-background">
      {children}
    </div>
  );
}

export default function Landing() {
  const intro = useIntroClock();
  useSmoothScroll();

  return (
    <IntroContext.Provider value={intro}>
      <LandingStage>
        <LandingBackdrop />
        <LandingNav />
        <main className="relative">
          <Hero />
          <WorkbenchShowcase />
          <PlanetReflection />
          <FeatureFabric />
          <PlanShowcase />
          <Faq />
        </main>
        <LandingFooter />
      </LandingStage>
    </IntroContext.Provider>
  );
}
