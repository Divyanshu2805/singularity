/**
 * The end of the new landing page: the last call to start, over a black hole, and the footer under it.
 *
 * Handles: the closing call - "What will you make tonight?" in Fraunces with "make" in the sign-in heading's gold,
 * the app's prompt again (IdeaPrompt) with the dashboard's quick-start chips under it that type their idea in - set in
 * the dark sky above the black hole (FooterHole, the hole fitted to reflect.app's footer video, standing on the
 * footer's top edge), so the copy never sits on its light and the prompt's solid card only meets the faint top of its
 * dome; the footer itself - the brand set as everywhere, one line on what the app does, the page's sections and the
 * account's ways in as links that underline themselves from the left (.wipe-link; the account's leave by the page
 * slide) - and the name rising very large out of a line of light as the page ends (FooterWordmark).
 *
 * The hole is what the sky's stars are drawn towards as the page nears its end (holeRef, which the page also hands to
 * LandingBackdrop's infall), so it reads as having mass before it is seen. The closing call rises in as
 * it comes into view; under reduced motion it is simply there.
 */
import type { RefObject } from "react";
import { Camera, Layers, ListChecks } from "lucide-react";
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { SlideLink } from "@/components/SlideLink";
import { FooterHole } from "@/components/landing/FooterHole";
import { FooterWordmark } from "@/components/landing/FooterWordmark";
import { useInView } from "@/components/landing/motion";
import { IdeaPrompt, type IdeaChip } from "./IdeaPrompt";

const CHIPS: IdeaChip[] = [
  { idea: "A todo app with drag and drop", icon: ListChecks },
  { idea: "A portfolio site for a photographer", icon: Camera },
  { idea: "A pricing page with three tiers", icon: Layers },
];

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Create an account", to: "/signup" },
  { label: "Sign in", to: "/login" },
];

export function Footer({ holeRef }: { holeRef?: RefObject<HTMLDivElement> }) {
  const [callRef, shown] = useInView<HTMLDivElement>({ threshold: 0.35 });

  return (
    <footer className="relative overflow-hidden">
      <div ref={callRef} data-shown={shown} className="ln-call relative z-10 mx-auto flex max-w-3xl flex-col items-center px-5 pt-24 text-center sm:px-8 sm:pt-32">
        <h2 className="landing-heading text-balance font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.022em] sm:text-[60px] lg:text-[68px]">
          What will you{" "}
          <em className="heat-text inline-block animate-heat-sweep pb-[0.1em] -mb-[0.1em] pr-1 font-medium not-italic motion-reduce:animate-none">make</em>{" "}
          tonight?
        </h2>
        <IdeaPrompt className="mt-10 w-full max-w-[40rem]" chips={CHIPS} label="Describe what you want to make" />
      </div>
      <div ref={holeRef} className="-mt-28 sm:-mt-40">
        <FooterHole />
      </div>
      <div className="footer-panel">
        <div className="landing-wrap flex flex-col gap-8 pt-14 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <span className="flex items-center gap-2.5">
              <HorizonMark className="h-8 w-8" />
              <BrandName className="text-[22px]" />
            </span>
            <p className="mt-3 text-[14px] leading-[1.65] text-muted-foreground">
              Describe an idea, answer four questions, and watch a real project get built, run and explained.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-12 gap-y-3 text-[14px] text-muted-foreground sm:grid-cols-3">
              {LINKS.map((link) => (
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
        </div>
        <FooterWordmark className="mt-8 sm:mt-10" />
      </div>
    </footer>
  );
}
