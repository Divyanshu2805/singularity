/**
 * The features: everything else a user gets, as working cards in four chapters - build, run, share, own.
 *
 * Handles: the section's intro; each chapter's name and one-line title; and under it that chapter's features as a row
 * of cards, each leading with its demo framed like a screen (FeatureDemos, scaled to the card by DemoFrame) and
 * putting the words under it - the feature's icon and label, a title, and a sentence or two. Every heading and card
 * rises into place with the scroll, the cards one after another along their row (scroll-rise.ts); under the pointer
 * a card's border and glow come up and a soft light follows the cursor across it. The card is the first landing
 * page's tile (index.css, .deck-tile) without its tilt: that page leaned the card towards the cursor in 3D with the
 * demo floating above it, and here the lean was kept at first, but a card that leans is drawn as a picture and
 * resampled, so the film went soft whenever the pointer was on it and the owner asked for that to be fixed. Nothing
 * under the pointer moves the film now (home.css, .home-tile).
 *
 * This is that page's feature deck laid flat: the chapters sit one under another instead of pinning and stacking, or
 * gliding up a lit floor. It carries ten of that page's thirteen features. Teaching mode and ExplainLLM moved to a
 * section of their own (Understand), which left "Understand" out of the chapters, and "Find anything" (code search
 * and the command palette) was cut - a convenience rather than a reason to sign up.
 *
 * A row is three cards wide, or two where the chapter has two features, so no row is left with a hole in it; the
 * live preview's card takes two of its row's three places, which gives its film room for the windows a narrow card
 * drops. How far a demo may be scaled up to fill its card depends on the row (demoMax): a row of three equal cards
 * to ROW_MAX, a two-card row further (WIDE_ROW_MAX) since its cards are wider, and the row that mixes a double card
 * with a single one only to MIXED_ROW_MAX, so the two demos come out near the same height and the words under them
 * start level.
 *
 * Two corrections to that page's copy: the interview asks two to four questions, not always four, and the preview
 * updates when a turn's files have finished writing, not as each file changes.
 */
import type { ReactNode } from "react";
import { BarChart3, Download, Eye, FileCode2, GitCompare, GitFork, ListChecks, ShieldCheck, Users, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoFrame } from "./DemoFrame";
import { DiffDemo, DownloadDemo, FixDemo, ForkDemo, InterviewDemo, PreviewDemo, RolesDemo, SecurityDemo, StreamDemo, UsageDemo } from "./FeatureDemos";
import { Lift } from "./Lift";
import { SectionIntro } from "./SectionIntro";
import { followPointer } from "./motion";
import { useScrollRise } from "./scroll-rise";

interface Feature {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  demo: ReactNode;
  wide?: boolean;
}

interface Chapter {
  name: string;
  title: string;
  columns: 2 | 3;
  features: Feature[];
}

const CHAPTERS: Chapter[] = [
  {
    name: "Build",
    title: "From one sentence to real files.",
    columns: 3,
    features: [
      {
        icon: ListChecks,
        label: "Idea interview",
        title: "A few questions, one clear brief.",
        body: "Two to four questions written for your idea, not pulled from a fixed list. Your answers become the brief the build starts from.",
        demo: <InterviewDemo />,
      },
      {
        icon: FileCode2,
        label: "Streamed build",
        title: "Watch every file get written.",
        body: "A checklist of the plan ticks off as each file streams into the project. No spinner, no waiting to find out.",
        demo: <StreamDemo />,
      },
      {
        icon: GitCompare,
        label: "Diffs",
        title: "See exactly what changed.",
        body: "Every turn marks the files it touched. Turn on the diff and read each change against the version before.",
        demo: <DiffDemo />,
      },
    ],
  },
  {
    name: "Run",
    title: "Running for real, fixed in a click.",
    columns: 3,
    features: [
      {
        icon: Eye,
        label: "Live preview",
        title: "It runs for real. Not in a mockup.",
        body: "Each project gets its own dev server in an isolated sandbox. Click around the actual app; it updates when a change lands.",
        demo: <PreviewDemo />,
        wide: true,
      },
      {
        icon: Wrench,
        label: "Fix errors",
        title: "Broken? Hand it back.",
        body: "When the running app throws an error, it shows beside the preview with one button that sends it to the chat as a fix request.",
        demo: <FixDemo />,
      },
    ],
  },
  {
    name: "Share",
    title: "Build it together.",
    columns: 2,
    features: [
      {
        icon: Users,
        label: "Collaborate",
        title: "Editors and viewers.",
        body: "Invite people by email. Editors change the project and use the chat, viewers open it and watch the same live preview. Only the owner manages who's in.",
        demo: <RolesDemo />,
      },
      {
        icon: GitFork,
        label: "Fork",
        title: "Take it somewhere new.",
        body: "Fork any project you can open. The copy is yours, with every file and a fresh chat. The original is untouched.",
        demo: <ForkDemo />,
      },
    ],
  },
  {
    name: "Own",
    title: "Yours to keep, and yours to control.",
    columns: 3,
    features: [
      {
        icon: Download,
        label: "Download",
        title: "Your code, yours to keep.",
        body: "Download the whole project as a ZIP. It is a normal React project with its own package.json, so it runs anywhere.",
        demo: <DownloadDemo />,
      },
      {
        icon: BarChart3,
        label: "Usage",
        title: "Know exactly where it went.",
        body: "A daily allowance that refills, and a breakdown by day, project and feature, with CSV export.",
        demo: <UsageDemo />,
      },
      {
        icon: ShieldCheck,
        label: "Security",
        title: "Signed in, and staying yours.",
        body: "Sign in with Google or email, add an authenticator app for two-factor, and sign out everywhere in one click.",
        demo: <SecurityDemo />,
      },
    ],
  },
];

const ROW_MAX = 1.43;
const MIXED_ROW_MAX = 1.22;
const WIDE_ROW_MAX = 1.7;

const demoMax = (chapter: Chapter) => (chapter.columns === 2 ? WIDE_ROW_MAX : chapter.features.some((feature) => feature.wide) ? MIXED_ROW_MAX : ROW_MAX);

function Tile({ feature, max }: { feature: Feature; max: number }) {
  return (
    <div onPointerMove={followPointer} className="deck-tile home-tile relative flex h-full flex-col rounded-[20px]">
      <span aria-hidden="true" className="deck-glare pointer-events-none absolute inset-0 rounded-[inherit]" />
      <div className="deck-float relative p-2.5 pb-0">
        <DemoFrame max={max}>{feature.demo}</DemoFrame>
      </div>
      <div className="relative flex flex-1 flex-col px-5 pb-6 pt-5 sm:px-6">
        <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.2em]">
          <span aria-hidden="true" className="tile-icon">
            <feature.icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-foreground/80">{feature.label}</span>
        </p>
        <h4 className="mt-3 font-display text-[21px] font-semibold leading-[1.15] tracking-tight text-foreground sm:text-[23px]">{feature.title}</h4>
        <p className="mt-2.5 text-[14.5px] leading-[1.65] text-foreground/65">{feature.body}</p>
      </div>
    </div>
  );
}

export function FeatureChapters() {
  const stack = useScrollRise<HTMLDivElement>();

  return (
    <section id="features" className="landing-wrap relative scroll-mt-24 pb-20 pt-10 sm:pb-28 sm:pt-16">
      <SectionIntro eyebrow="Features" title="Every feature," accent="already doing its job." />

      <div ref={stack} className="mt-14 space-y-16 sm:mt-20 sm:space-y-24">
        {CHAPTERS.map((chapter) => (
          <div key={chapter.name}>
            <Lift>
              <header className="px-1 pb-5 sm:pb-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">{chapter.name}</p>
                <h3 className="mt-2 font-display text-[24px] font-semibold leading-tight tracking-tight sm:text-[30px]">{chapter.title}</h3>
              </header>
            </Lift>
            <div className={cn("grid gap-4", chapter.columns === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3")}>
              {chapter.features.map((feature, order) => (
                <Lift key={feature.label} order={order} className={cn(feature.wide && "lg:col-span-2")}>
                  <Tile feature={feature} max={demoMax(chapter)} />
                </Lift>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
