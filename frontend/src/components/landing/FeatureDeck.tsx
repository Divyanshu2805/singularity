/**
 * The feature deck: every feature a user gets, as a working card, grouped into five chapters - build, run,
 * understand, share, own - that stack up like a deck as the visitor scrolls. It is the features section wherever
 * the fabric stage (FeatureFabric) can't run - a narrow or short screen, or reduced motion - and it owns the list of
 * chapters and features (CHAPTERS) that the fabric shows too.
 *
 * Handles: the section's intro; the chapter panels, each with its large gradient number, name, feature count, title
 * and a small progress rail; on a wide, tall enough screen, pinning each panel near the top so the next one slides up
 * over it while the ones underneath sink back, shrink and darken into a stack (--depth, written from one
 * animation-frame-batched scroll listener, so scrolling never re-renders a panel, and remeasured whenever a panel
 * changes size - measured only once at mount, before the layout had settled, the panels could start out darkened
 * until the first scroll); pausing the demos of a panel once it is buried under the next, since a covered panel is
 * still on screen as far as its demos can tell, and otherwise all thirteen kept re-rendering at once under the stack
 * (the only re-render scrolling causes, and only when a panel crosses that line); bringing each panel's cards in as
 * it arrives - rising and settling one after another, then the demo, label, title and copy in turn; and, under the
 * pointer, a card lifting and tilting towards the cursor, its demo floating a little above it in 3D, while a soft
 * glare follows the cursor across the card.
 *
 * Each card leads with its demo, framed like a screen, and puts the words under it: the feature's icon, label and
 * number, the title,
 * and the copy at a readable size and contrast. The demos are drawn at one design size (FeatureDemos' fixed-height
 * stage), so DemoScale scales each one up to the width its card actually has - by transform inside a box whose
 * height it sets, so the layout stays exact in every browser - rather than leaving small type adrift in a wide card;
 * the scale is capped so a panel still fits the screen it pins to. The cards used to flip up in 3D and carry large
 * outlined numerals behind their titles; the numerals competed with the titles and the flip read as busy, so a calmer
 * rise replaced them. The tilt was taken out with them and brought back at the owner's request - it is what makes
 * the cards feel alive under the pointer. The panels and cards are fully
 * opaque: slightly translucent ones let the cards of the panel stacked under them show through as ghost text.
 *
 * The demos live in FeatureDemos. Under reduced motion nothing is dealt, tilted or stacked - the panels simply sit
 * one after another - and every demo shows its finished frame. Below the stacking breakpoint (index.css,
 * .deck-chapter) the panels flow normally, since a panel taller than the screen can't be pinned. Each chapter is a single row of cards so a panel stays shorter than the screen it pins to.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { BarChart3, Download, Eye, FileCode2, GitCompare, GitFork, GraduationCap, ListChecks, MessagesSquare, Search, ShieldCheck, Users, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DiffDemo,
  DownloadDemo,
  ExplainDemo,
  FixDemo,
  ForkDemo,
  InterviewDemo,
  PreviewDemo,
  RolesDemo,
  SearchDemo,
  SecurityDemo,
  StreamDemo,
  TeachingDemo,
  UsageDemo,
} from "./FeatureDemos";
import { SectionIntro } from "./SectionIntro";
import { DemoPausedContext, releaseTilt, tiltToPointer, useInView } from "./motion";

export interface Feature {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  demo: ReactNode;
  wide?: boolean;
}

export interface Chapter {
  name: string;
  title: string;
  features: Feature[];
}

export const CHAPTERS: Chapter[] = [
  {
    name: "Build",
    title: "From one sentence to real files.",
    features: [
      {
        icon: ListChecks,
        label: "Idea interview",
        title: "Four questions, one clear brief.",
        body: "Describe your idea in a sentence, then answer four questions tailored to it — who it's for, what they do, the screens it needs and how it should feel.",
        demo: <InterviewDemo />,
      },
      {
        icon: FileCode2,
        label: "Streamed build",
        title: "Watch every file get written.",
        body: "The AI builds through a chat. Each file streams in as it's written, so you see the project take shape instead of waiting on a spinner.",
        demo: <StreamDemo />,
      },
      {
        icon: GitCompare,
        label: "Diffs",
        title: "See exactly what changed.",
        body: "Every turn marks the files it touched. Flip on the diff and read the changes line by line against the version before.",
        demo: <DiffDemo />,
      },
    ],
  },
  {
    name: "Run",
    title: "Running for real, fixed in a click.",
    features: [
      {
        icon: Eye,
        label: "Live preview",
        title: "It runs for real. Not in a mockup.",
        body: "Every project gets its own dev server in an isolated Kubernetes pod. Watch it boot, then click around the actual app — it hot-reloads as files change.",
        demo: <PreviewDemo />,
        wide: true,
      },
      {
        icon: Wrench,
        label: "Fix errors",
        title: "Broken? Hand it back.",
        body: "When the preview throws, the error shows up beside it with one button to send it to the chat as a fix request.",
        demo: <FixDemo />,
      },
    ],
  },
  {
    name: "Understand",
    title: "Learn what it wrote, line by line.",
    features: [
      {
        icon: GraduationCap,
        label: "Teaching mode",
        title: "Learn while it writes.",
        body: "Switch it on and each step comes with a plain-English note on the idea it uses, linked to the line it is about.",
        demo: <TeachingDemo />,
      },
      {
        icon: MessagesSquare,
        label: "ExplainLLM",
        title: "Ask about any line.",
        body: "Highlight a block and ask why, or ask about the project as a whole. It reads your files as it needs them — and never edits a thing.",
        demo: <ExplainDemo />,
        wide: true,
      },
    ],
  },
  {
    name: "Share",
    title: "Find it, share it, fork it.",
    features: [
      {
        icon: Search,
        label: "Find anything",
        title: "Every file, one keystroke away.",
        body: "Search across your project's code and jump to the line, or hit ⌘K to hop between projects and pages.",
        demo: <SearchDemo />,
      },
      {
        icon: Users,
        label: "Collaborate",
        title: "Build it together.",
        body: "Invite people by email as an editor or a viewer. Everyone sees the same project; only you decide who can change it.",
        demo: <RolesDemo />,
      },
      {
        icon: GitFork,
        label: "Fork",
        title: "Take it somewhere new.",
        body: "Fork any project you can see. The copy is yours, with every file and a fresh chat — the original never feels it.",
        demo: <ForkDemo />,
      },
    ],
  },
  {
    name: "Own",
    title: "Yours to keep, and yours to control.",
    features: [
      {
        icon: Download,
        label: "Download",
        title: "Your code, yours to keep.",
        body: "Download the whole project as a ZIP whenever you like and run it anywhere. No lock-in.",
        demo: <DownloadDemo />,
      },
      {
        icon: BarChart3,
        label: "Usage",
        title: "Know exactly where it went.",
        body: "A clear daily allowance and a breakdown by day, project and feature, with a CSV export. The server enforces it.",
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

const TILT = 6;
const DEMO_HEIGHT = 196;
const DEMO_DESIGN_WIDTH = 350;
const DEMO_MAX_SCALE = 1.22;

function DemoScale({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0 });

  useLayoutEffect(() => {
    const node = outer.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const scale = Math.min(DEMO_MAX_SCALE, Math.max(1, width / DEMO_DESIGN_WIDTH));
      setFit((current) => (current.width === width && current.scale === scale ? current : { scale, width }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} style={{ height: DEMO_HEIGHT * fit.scale }}>
      <div style={{ width: fit.width ? fit.width / fit.scale : "100%", transform: `scale(${fit.scale})`, transformOrigin: "0 0" }}>{children}</div>
    </div>
  );
}

function FeatureTile({ feature, number, order }: { feature: Feature; number: number; order: number }) {
  const rise = (index: number) => ({ "--i": index }) as CSSProperties;

  return (
    <div className={cn("deck-deal", feature.wide && "lg:col-span-2")} style={{ "--deal": order } as CSSProperties}>
      <div
        onPointerMove={(event) => tiltToPointer(event, TILT)}
        onPointerLeave={releaseTilt}
        className="deck-tile group relative flex h-full flex-col rounded-[20px]"
      >
        <span aria-hidden="true" className="deck-glare pointer-events-none absolute inset-0 rounded-[inherit]" />
        <div className="deck-rise deck-float relative p-2.5 pb-0" style={rise(0)}>
          <DemoScale>{feature.demo}</DemoScale>
        </div>
        <div className="relative flex flex-1 flex-col px-5 pb-6 pt-5 sm:px-6">
          <p className="deck-rise flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.2em]" style={rise(1)}>
            <span aria-hidden="true" className="tile-icon">
              <feature.icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-foreground/80">{feature.label}</span>
            <span className="ml-auto tabular-nums text-primary/80">{String(number).padStart(2, "0")}</span>
          </p>
          <h3 className="deck-rise mt-3 font-display text-[21px] font-semibold leading-[1.15] tracking-tight text-foreground sm:text-[23px]" style={rise(2)}>
            {feature.title}
          </h3>
          <p className="deck-rise mt-2.5 text-[14.5px] leading-[1.65] text-foreground/65" style={rise(3)}>
            {feature.body}
          </p>
        </div>
      </div>
    </div>
  );
}

function ChapterPanel({ chapter, index, count, start, paused, panelRef }: {
  chapter: Chapter;
  index: number;
  count: number;
  start: number;
  paused: boolean;
  panelRef: (node: HTMLElement | null) => void;
}) {
  const [ref, dealt] = useInView<HTMLDivElement>({ threshold: 0.2, rootMargin: "0px 0px -10% 0px" });

  return (
    <article ref={panelRef} className="deck-chapter" style={{ "--chapter": index } as CSSProperties}>
      <div ref={ref} data-dealt={dealt} className="deck-panel relative rounded-[28px] p-3 sm:p-5">
        <span aria-hidden="true" className="deck-panel-edge pointer-events-none absolute -top-px left-1/2 h-px w-1/2 -translate-x-1/2" />
        <header className="flex flex-wrap items-end justify-between gap-4 px-1 pb-5 sm:pb-6">
          <div className="flex items-end gap-4 sm:gap-5">
            <span aria-hidden="true" className="deck-chapter-number font-display text-[52px] font-semibold leading-[0.8] tracking-tight sm:text-[64px]">
              0{index + 1}
            </span>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">
                {chapter.name}
                <span className="ml-2.5 text-muted-foreground/70">
                  · {chapter.features.length} features · {index + 1} of {count}
                </span>
              </p>
              <h3 className="mt-2 font-display text-[24px] font-semibold leading-tight tracking-tight sm:text-[30px]">{chapter.title}</h3>
            </div>
          </div>
          <div aria-hidden="true" className="flex gap-1.5 pb-2">
            {Array.from({ length: count }, (_, step) => (
              <span key={step} className={cn("h-1 rounded-full transition-all duration-500", step === index ? "w-8 bg-primary" : step < index ? "w-3 bg-primary/40" : "w-3 bg-white/10")} />
            ))}
          </div>
        </header>
        <DemoPausedContext.Provider value={paused}>
          <div className="grid gap-4 lg:grid-cols-3">
            {chapter.features.map((feature, order) => (
              <FeatureTile key={feature.label} feature={feature} number={start + order + 1} order={order} />
            ))}
          </div>
        </DemoPausedContext.Provider>
      </div>
    </article>
  );
}

const COVERED = 0.95;

function useStackDepth(panels: MutableRefObject<(HTMLElement | null)[]>) {
  const [covered, setCovered] = useState<boolean[]>([]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const nodes = panels.current;
      const rects = nodes.map((node) => node?.getBoundingClientRect() ?? null);
      const buried = nodes.map((node, index) => {
        const rect = rects[index];
        if (!node || !rect) return false;
        let depth = 0;
        for (let next = index + 1; next < rects.length; next += 1) {
          const other = rects[next];
          if (other) depth += Math.min(1, Math.max(0, 1 - (other.top - rect.top) / rect.height));
        }
        node.style.setProperty("--depth", depth.toFixed(3));
        return depth >= COVERED;
      });
      setCovered((current) => (current.length === buried.length && current.every((value, index) => value === buried[index]) ? current : buried));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(() => update());
    panels.current.forEach((node) => node && observer.observe(node));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [panels]);

  return covered;
}

const STARTS = CHAPTERS.map((_, index) => CHAPTERS.slice(0, index).reduce((sum, chapter) => sum + chapter.features.length, 0));

export function FeatureDeck() {
  const panels = useRef<(HTMLElement | null)[]>([]);
  const covered = useStackDepth(panels);

  return (
    <section id="features" className="landing-wrap relative scroll-mt-24 pb-24 pt-6 sm:pb-32 sm:pt-10">
      <SectionIntro eyebrow="Features" title="Every feature," accent="already doing its job." />

      <div className="deck-stack mt-12 sm:mt-16">
        {CHAPTERS.map((chapter, index) => (
          <ChapterPanel
            key={chapter.name}
            chapter={chapter}
            index={index}
            count={CHAPTERS.length}
            start={STARTS[index]}
            paused={Boolean(covered[index])}
            panelRef={(node) => {
              panels.current[index] = node;
            }}
          />
        ))}
      </div>
    </section>
  );
}
