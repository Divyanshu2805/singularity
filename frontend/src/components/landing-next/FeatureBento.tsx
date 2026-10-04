/**
 * The new landing page's features: six cards in the sign-in card's material, each acting out one thing the app does
 * with a small celestial scene beside a piece of the real thing.
 *
 * Handles: the section's heading (Heading), and the cards on a four-column grid, the two that carry most - Code Lens
 * and working together - twice as wide: Code Lens (LensCode - a lens magnifying a line of real code while ExplainLLM's
 * answer streams in), teaching mode (moons waxing as each idea gets its note), fork (a star splitting into a binary
 * pair), usage (the day's allowance as an orbit gauge over the week's bars), download (a capsule escaping orbit with
 * the project's ZIP) and working together (three people as moons on Kepler orbits round the project, beside the share
 * list with their roles). The scenes are feature-scenes.ts's, played by LoopCanvas. Every claim is something the app
 * does today, in the words its own screens use.
 *
 * Each card tilts a degree or two towards a mouse and a faint light follows the pointer across it (motion.ts's
 * tiltToPointer, the card's glare), and its scene warms under the pointer. The cards come in with the scroll, each
 * rising into place as it comes up the screen, the later columns a beat behind the earlier ones - written straight
 * onto each card from lib/scroll-scene's shared frame, so a scroll re-renders nothing, and run backwards when the
 * visitor scrolls up. Under reduced motion they are simply in place and their scenes hold still.
 */
import { useRef, type ReactNode } from "react";
import { Download, Gauge, GitFork, GraduationCap, ScanSearch, Users, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/landing/AppReplica";
import { PEOPLE } from "@/components/landing/replica";
import { releaseTilt, tiltToPointer, usePrefersReducedMotion } from "@/components/landing/motion";
import { LoopCanvas } from "@/components/cosmos/LoopCanvas";
import { binary, escape, gauge, moonsScene, phases } from "@/components/cosmos/feature-scenes";
import { easeOut, useScrollScene } from "@/lib/scroll-scene";
import { cn } from "@/lib/utils";
import { Heading } from "./Heading";
import { LensCode } from "./LensCode";

const RISE = 56;
const RISE_LAG = 36;
const RISE_SHARE = 0.42;
const ROLES = ["Owner", "Can edit", "Can view"];
const MEMBERS = PEOPLE.map((person, index) => ({ ...person, role: ROLES[index] }));
const moons = moonsScene(MEMBERS);

function ShareList() {
  return (
    <ul className="ln-share flex w-full flex-col gap-1.5 rounded-2xl p-2">
      {MEMBERS.map((member) => (
        <li key={member.email} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <Avatar person={member} className="h-7 w-7 text-[11px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-foreground">{member.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{member.email}</span>
          </span>
          <span className={cn("ln-role shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium", member.role === "Owner" && "ln-role-owner")}>{member.role}</span>
        </li>
      ))}
    </ul>
  );
}

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  wide?: boolean;
  stage: ReactNode;
}

const FEATURES: Feature[] = [
  {
    icon: ScanSearch,
    title: "Ask about any line",
    body: "Select code and ask why it works. ExplainLLM reads the file and answers — and never edits it.",
    wide: true,
    stage: <LensCode />,
  },
  {
    icon: GraduationCap,
    title: "Learn while it builds",
    body: "Teach me mode adds a plain-English note on the idea behind each file.",
    stage: <LoopCanvas scene={phases} still={7} />,
  },
  {
    icon: GitFork,
    title: "Fork any project",
    body: "Copy a project into a new one and take it somewhere else.",
    stage: <LoopCanvas scene={binary} still={6} />,
  },
  {
    icon: Gauge,
    title: "Know where it went",
    body: "A daily allowance, and a breakdown by day, by project and by feature.",
    stage: <LoopCanvas scene={gauge} still={5} />,
  },
  {
    icon: Download,
    title: "Yours to keep",
    body: "Download the whole project as a ZIP and run it anywhere.",
    stage: <LoopCanvas scene={escape} still={4.2} />,
  },
  {
    icon: Users,
    title: "Build it together",
    body: "Invite people as editors or viewers. Only the owner decides who is in.",
    wide: true,
    stage: (
      <div className="grid h-full grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-center gap-3 pr-4">
        <LoopCanvas scene={moons} still={3} />
        <ShareList />
      </div>
    ),
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const { icon: Icon, title, body, stage } = feature;

  return (
    <article
      data-feature
      onPointerMove={(event) => tiltToPointer(event, 2)}
      onPointerLeave={releaseTilt}
      className="ln-feature auth-panel group relative flex h-full min-w-0 flex-col overflow-hidden"
    >
      <span aria-hidden="true" className="ln-feature-glare pointer-events-none absolute inset-0 rounded-[inherit]" />
      <div className="ln-feature-stage relative">{stage}</div>
      <div className="relative flex items-start gap-3 px-5 pb-5 pt-4">
        <span className="tile-icon mt-0.5">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-foreground">{title}</h3>
          <p className="mt-1 text-[14px] leading-[1.55] text-muted-foreground">{body}</p>
        </div>
      </div>
    </article>
  );
}

export function FeatureBento() {
  const gridRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useScrollScene(gridRef, (frame) => {
    const grid = gridRef.current;
    if (!grid || reduced) return;
    const cells = Array.from(grid.querySelectorAll<HTMLElement>("[data-cell]"));
    const places = cells.map((cell) => ({
      top: cell.getBoundingClientRect().top - (Number(cell.dataset.lift) || 0),
      column: Math.round((cell.offsetLeft / Math.max(1, grid.clientWidth)) * 4),
    }));
    cells.forEach((cell, index) => {
      const { top, column } = places[index];
      const show = easeOut(Math.min(1, Math.max(0, (frame.viewport - top - column * RISE_LAG) / (frame.viewport * RISE_SHARE))));
      const lift = (1 - show) * RISE;
      cell.dataset.lift = lift.toFixed(1);
      cell.style.transform = `translate3d(0, ${lift.toFixed(1)}px, 0)`;
      cell.style.opacity = show.toFixed(3);
    });
  });

  return (
    <section id="features" aria-labelledby="features-title" className="landing-wrap relative scroll-mt-24 pb-24 pt-10 sm:pb-32 sm:pt-14">
      <Heading id="features-title" eyebrow="Features" title="Everything around the" accent="build." />
      <div ref={gridRef} className="mx-auto mt-14 grid max-w-[82rem] gap-5 sm:mt-20 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <div key={feature.title} data-cell className={cn("min-w-0 will-change-transform", feature.wide && "md:col-span-2")}>
            <FeatureCard feature={feature} />
          </div>
        ))}
      </div>
    </section>
  );
}
