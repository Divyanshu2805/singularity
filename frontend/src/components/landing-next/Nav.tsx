/**
 * The new landing page's navigation: one floating pill of the app's dark material across the top of the screen.
 *
 * Handles: the brand set exactly as the sign-in page sets it (the horizon mark with its glow held still, and the name
 * in Fraunces), the section links in the reading face with the sign-in switch's gold chip gliding to the section being
 * read (motion.ts's useActiveSection and placeMarker) and a fainter pill gliding after the pointer, and on the right
 * "Sign in" and "Start building" - the app's own ghost and primary buttons, each leaving for the sign-in pages by the
 * page slide. Once the page has scrolled the pill draws in to a narrower width and turns more opaque, so it reads
 * over whatever passes under it. It comes down on the page's opening (DAWN.nav), its items following one by one.
 *
 * A link that was just clicked holds the chip while the page glides to its section rather than stepping it through
 * every section on the way, until that section is reached, the visitor takes the scroll back or PICK_HOLD_MS passes.
 * Both pills are re-placed when the links change size, as when the web font arrives.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { SlideLink } from "@/components/SlideLink";
import { Button } from "@/components/ui/button";
import { ITEM_DROP, NAV_DROP, useIntroEntrance, useIntroStagger } from "@/components/landing/intro";
import { placeMarker, useActiveSection } from "@/components/landing/motion";
import { cn } from "@/lib/utils";
import { DAWN } from "./dawn";

const NAV_LINKS = [
  { label: "How it works", id: "how" },
  { label: "Features", id: "features" },
  { label: "Security", id: "security" },
  { label: "Pricing", id: "pricing" },
  { label: "FAQ", id: "faq" },
];

const SECTIONS = NAV_LINKS.map((link) => link.id);
const PICK_HOLD_MS = 2400;

function Sections() {
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
    <div className="nav-sections absolute left-1/2 hidden -translate-x-1/2 lg:block" onPointerLeave={() => setHovered(null)}>
      <span ref={hoverRef} aria-hidden="true" data-for={hovered ?? undefined} className="nav-hover" />
      <span ref={activeRef} aria-hidden="true" data-for={active ?? undefined} className="nav-active ln-chip" />
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

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useIntroEntrance(navRef, NAV_DROP, DAWN.nav);
  useIntroStagger(navRef, "[data-intro-item]", ITEM_DROP, { at: DAWN.nav.at + 110, for: 750 }, DAWN.navStep);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className="ln-header fixed inset-x-0 top-0 z-50 px-[var(--gutter)] pt-3 sm:pt-4">
      <nav
        ref={navRef}
        aria-label="Main"
        data-scrolled={scrolled}
        className={cn(
          "ln-nav relative mx-auto flex h-14 w-full items-center gap-3 rounded-full pl-4 pr-2 transition-[max-width,background-color,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:pl-5",
          scrolled ? "max-w-5xl" : "max-w-[97.5rem]"
        )}
      >
        <Link
          to="/"
          aria-label="Singularity home"
          data-intro-item
          className="ln-brand flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="relative inline-flex h-8 w-8 shrink-0">
            <span aria-hidden="true" className="nav-brand-glow pointer-events-none absolute -inset-[60%] rounded-full" />
            <HorizonMark className="relative h-full w-full" />
          </span>
          <BrandName className="hidden text-[21px] sm:inline" />
        </Link>
        <Sections />
        <div className="ml-auto flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm" data-intro-item className="hidden sm:inline-flex">
            <SlideLink to="/login">Sign in</SlideLink>
          </Button>
          <Button asChild size="sm" data-intro-item style={{ "--icon-hover": "translateX(3px)" } as CSSProperties}>
            <SlideLink to="/login">
              Start building
              <ArrowRight />
            </SlideLink>
          </Button>
        </div>
      </nav>
    </header>
  );
}
