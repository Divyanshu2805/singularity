/**
 * The landing page's navigation: the floating glass pill at the top of the page.
 *
 * Handles: the pill itself, narrowing and darkening once the page is scrolled; the horizon mark and the name as its
 * brand, which build themselves on load, rebuild on hover and float in a breathing glow; the section links, which
 * show where the visitor is - a frosted glass chip outlined in the button's gold glides to the section being read
 * (motion.ts's useActiveSection), a fainter pill glides after the pointer across the links, and a pressed link sinks
 * with that pill; a "Sign in" link for someone who already has an account; and the "Start building" button
 * (LandingButton), which leaves for sign-up by the page slide.
 *
 * The section highlight holds on a link that was just clicked while the page scrolls to it, rather than stepping
 * through every section on the way, until that section is reached, the visitor takes the scroll back (wheel, touch or
 * key) or PICK_HOLD_MS passes. Both pills are placed (motion.ts's placeMarker) from the links' own offsets, written as
 * custom properties on the pill, so gliding between links is a CSS transition; a pill that is appearing is placed
 * without one (data-snap) and fades in where it lands instead of sliding in from wherever it last was. They are
 * re-placed when the links' size changes, as when the web font arrives.
 *
 * On a load at the top of the page the pill drops in on the opening sequence's clock (intro.ts) and its items follow
 * left to right. The page passes the links, so the pill names whatever sections that page has; the list must be a
 * constant, since the section spy is rebuilt whenever it changes.
 *
 * This is the pill the first landing page (since removed) carried, moved out to a file of its own for the home
 * page that replaces it. "Sign in" is the one addition: the first page had only "Start building", which sent a
 * returning visitor and a new one to the same place.
 *
 * The home page names all six of its sections here, at the owner's request, where the pill used to carry four. Six
 * links are about 525px wide and sit centred on the pill, so the widths are set by what clears them: the scrolled pill
 * narrows to 70rem rather than 56rem (at 56rem the last link ran under "Sign in"), the links show from the large
 * breakpoint up rather than the medium one (below it the brand and the button leave no room for them), and "Sign in"
 * shows from the extra-large breakpoint up, where there is room for it beside them.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { SlideLink } from "@/components/SlideLink";
import { cn } from "@/lib/utils";
import { LandingButton } from "./LandingButton";
import { INTRO, ITEM_DROP, NAV_DROP, useIntroEntrance, useIntroReached, useIntroStagger } from "./intro";
import { placeMarker, useActiveSection } from "./motion";

export interface NavLink {
  label: string;
  id: string;
}

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

function NavSections({ links }: { links: readonly NavLink[] }) {
  const anchors = useRef<Record<string, HTMLAnchorElement | null>>({});
  const listRef = useRef<HTMLUListElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const sections = useMemo(() => links.map((link) => link.id), [links]);
  const spied = useActiveSection(sections);
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

  useLayoutEffect(() => placeMarker(activeRef.current, active ? anchors.current[active] : null), [active]);
  useLayoutEffect(() => placeMarker(hoverRef.current, hovered ? anchors.current[hovered] : null), [hovered]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      for (const marker of [activeRef.current, hoverRef.current]) {
        const id = marker?.dataset.for;
        if (marker?.dataset.shown === "true" && id) placeMarker(marker, anchors.current[id], true);
      }
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="nav-sections absolute left-1/2 hidden -translate-x-1/2 lg:block" onPointerLeave={() => setHovered(null)}>
      <span ref={hoverRef} aria-hidden="true" data-for={hovered ?? undefined} className="nav-hover" />
      <span ref={activeRef} aria-hidden="true" data-for={active ?? undefined} className="nav-active" />
      <ul ref={listRef} className="flex items-center gap-0.5">
        {links.map((link) => {
          const current = active === link.id;
          return (
            <li key={link.id} data-intro-item>
              <a
                ref={(node) => {
                  anchors.current[link.id] = node;
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

export function LandingNav({ links }: { links: readonly NavLink[] }) {
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
          scrolled ? "max-w-[70rem]" : "max-w-[97.5rem]"
        )}
      >
        <NavBrand />
        <NavSections links={links} />
        <SlideLink
          to="/login"
          data-intro-item
          className="nav-link ml-auto hidden rounded-full px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:block"
        >
          Sign in
        </SlideLink>
        <LandingButton to="/signup" size="sm" data-intro-item className="ml-auto xl:ml-0">
          Start building
        </LandingButton>
      </nav>
    </header>
  );
}
