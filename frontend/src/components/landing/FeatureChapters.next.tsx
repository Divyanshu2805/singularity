/**
 * The features: everything else a user gets, as working cards in four chapters - build, run, share, own - standing on
 * a sheet of space-time that the scroll moves. This is the version waiting for the owner's word: it is shown at the
 * development-only /features-next (pages/FeaturesNext.tsx) beside the one on the home page (FeatureChapters.tsx),
 * which it replaces once approved.
 *
 * Handles: the section's intro; each chapter's name and one-line title; and under it that chapter's features as a row
 * of cards, each leading with its demo framed like a screen (FeatureDemos, scaled to the card by DemoFrame) and
 * putting the words under it - the feature's icon and label, a title, and a sentence or two. Every heading and card
 * rises into place with the scroll, the cards one after another along their row (scroll-rise.ts); under the pointer
 * a card's border and glow come up and a soft light follows the cursor across it. The copy, the cards and the rows
 * are FeatureChapters.tsx's, unchanged; what is added is three things the owner chose from six ideas, with one
 * condition - "when I scroll the animation of cards should behave as I scroll".
 *
 * The cards have weight. The hero's grid carries on behind the section (FeatureSheet), and each card presses a well
 * into it as it lands and sends one ring out across it; how deep the well is and how far the ring has gone are read
 * off the scroll alone (feature-motion.ts), so both follow the wheel down the page and back up it.
 *
 * One film at a time. In the chapter being read only one card's film plays; the others stand on their finished
 * frame, their screens dimmed (home.css, .home-tile[data-relay]). The turn passes along the row when the film
 * ends - a film says how long it is through DemoTurnContext, and the turn is cut CUT_EARLY before the end so the
 * card is left on its last frame rather than its first - and the card whose turn it is presses the sheet a little
 * deeper. Moving the pointer onto a card takes the turn and holds it there until the pointer leaves, and the turn
 * then carries on from that card. Only a pointer that has really moved counts: while the page scrolls under a still
 * pointer the browser reports the cards passing beneath it, and those would hand the turn to whichever card the
 * pointer happened to be over. A touch takes the turn without holding it.
 *
 * The chapter in focus. The chapter across the middle of the screen is fully lit and the ones above and below it dim
 * as they move away, with the scroll; the most lit chapter leads, and only the leading chapter's films play.
 *
 * All three need room and motion: on a screen narrower than WIDE, or under reduced motion, there is no sheet, no
 * dimming and no turns, and every film plays as it comes on screen - the section as it was.
 *
 * A row is three cards wide, or two where the chapter has two features, so no row is left with a hole in it; the
 * live preview's card takes two of its row's three places, which gives its film room for the windows a narrow card
 * drops. How far a demo may be scaled up to fill its card depends on the row (demoMax): a row of three equal cards
 * to ROW_MAX, a two-card row further (WIDE_ROW_MAX) since its cards are wider, and the row that mixes a double card
 * with a single one only to MIXED_ROW_MAX, so the two demos come out near the same height and the words under them
 * start level. The cards do not tilt: a card that leans is drawn as a picture and resampled, which left every film's
 * type soft (home.css, .home-tile).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { BarChart3, Download, Eye, FileCode2, GitCompare, GitFork, ListChecks, ShieldCheck, Users, Wrench, type LucideIcon } from "lucide-react";
import { turnLeft } from "@/lib/feature-sheet";
import { cn } from "@/lib/utils";
import { DemoFrame } from "./DemoFrame";
import { DiffDemo, DownloadDemo, FixDemo, ForkDemo, InterviewDemo, PreviewDemo, RolesDemo, SecurityDemo, StreamDemo, UsageDemo } from "./FeatureDemos";
import { FeatureSheet, type SheetHandle } from "./FeatureSheet";
import { Lift } from "./Lift";
import { SectionIntro } from "./SectionIntro";
import { useFeatureMotion } from "./feature-motion";
import { DemoTurnContext, followPointer, usePrefersReducedMotion, type DemoTurn } from "./motion";
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
const WIDE = "(min-width: 1024px)";
const CUT_EARLY = 160;
const LEAST_TURN = 600;

const STARTS = CHAPTERS.map((_, chapter) => CHAPTERS.slice(0, chapter).reduce((count, earlier) => count + earlier.features.length, 0));

const demoMax = (chapter: Chapter) => (chapter.columns === 2 ? WIDE_ROW_MAX : chapter.features.some((feature) => feature.wide) ? MIXED_ROW_MAX : ROW_MAX);

const chapterOf = (card: number) => STARTS.reduce((found, start, chapter) => (card >= start ? chapter : found), 0);

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE).matches);

  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return wide;
}

interface TileProps {
  feature: Feature;
  max: number;
  card: number;
  staged: boolean;
  playing: boolean;
  onHold: (card: number) => void;
  onRelease: (card: number) => void;
  onTake: (card: number) => void;
  onLength: (card: number, loopMs: number) => void;
}

function Tile({ feature, max, card, staged, playing, onHold, onRelease, onTake, onLength }: TileProps) {
  const turn = useMemo<DemoTurn | null>(() => (staged ? { playing, onLength: (loopMs) => onLength(card, loopMs) } : null), [staged, playing, onLength, card]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    followPointer(event);
    if (staged && event.pointerType === "mouse" && (event.movementX !== 0 || event.movementY !== 0)) onHold(card);
  };

  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (staged && event.pointerType !== "mouse") onTake(card);
  };

  return (
    <div
      data-tile
      data-relay={staged ? (playing ? "playing" : "waiting") : undefined}
      onPointerMove={move}
      onPointerDown={press}
      onPointerLeave={() => onRelease(card)}
      className="deck-tile home-tile relative flex h-full flex-col rounded-[20px]"
    >
      <span aria-hidden="true" className="deck-glare pointer-events-none absolute inset-0 rounded-[inherit]" />
      <div className="deck-float relative p-2.5 pb-0">
        <DemoTurnContext.Provider value={turn}>
          <DemoFrame max={max}>{feature.demo}</DemoFrame>
        </DemoTurnContext.Provider>
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
      {staged && <span data-veil aria-hidden="true" className="feature-veil" />}
    </div>
  );
}

export function FeatureChapters() {
  const reduced = usePrefersReducedMotion();
  const wide = useWide();
  const staged = wide && !reduced;
  const section = useRef<HTMLElement>(null);
  const sheet = useRef<SheetHandle>(null);
  const stack = useScrollRise<HTMLDivElement>();
  const [lead, setLead] = useState(0);
  const [turns, setTurns] = useState(() => CHAPTERS.map(() => 0));
  const [held, setHeld] = useState(-1);
  const [lengths, setLengths] = useState<number[]>([]);
  const playing = held >= 0 ? held : STARTS[lead] + turns[lead];
  const length = lengths[playing] ?? 0;
  const playingNow = useRef(playing);
  const heldNow = useRef(held);
  const startedAt = useRef(0);
  playingNow.current = playing;
  heldNow.current = held;

  useFeatureMotion({ enabled: staged, section, sheet, playing: playingNow, held: heldNow, onLead: setLead });

  useEffect(() => {
    startedAt.current = performance.now();
  }, [playing]);

  useEffect(() => {
    if (!staged || held >= 0 || !length) return;
    const left = turnLeft(length, startedAt.current, performance.now()) - CUT_EARLY;
    const wait = left < LEAST_TURN ? left + length : left;
    const timer = window.setTimeout(() => {
      setTurns((now) => now.map((turn, chapter) => (chapter === lead ? (turn + 1) % CHAPTERS[chapter].features.length : turn)));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [staged, held, length, playing, lead]);

  const take = useCallback((card: number) => {
    const chapter = chapterOf(card);
    setTurns((now) => (now[chapter] === card - STARTS[chapter] ? now : now.map((turn, index) => (index === chapter ? card - STARTS[chapter] : turn))));
  }, []);

  const hold = useCallback(
    (card: number) => {
      setHeld(card);
      take(card);
    },
    [take]
  );

  const release = useCallback((card: number) => setHeld((now) => (now === card ? -1 : now)), []);

  const note = useCallback((card: number, loopMs: number) => {
    setLengths((now) => {
      if (now[card] === loopMs) return now;
      const next = now.slice();
      next[card] = loopMs;
      return next;
    });
  }, []);

  return (
    <section ref={section} id="features" className="relative scroll-mt-24 pb-20 pt-10 sm:pb-28 sm:pt-16">
      {staged && <FeatureSheet ref={sheet} />}
      <div className="landing-wrap relative">
        <SectionIntro eyebrow="Features" title="Every feature," accent="already doing its job." />

        <div ref={stack} className="mt-14 space-y-16 sm:mt-20 sm:space-y-24">
          {CHAPTERS.map((chapter, index) => (
            <div key={chapter.name} data-chapter={index}>
              <Lift>
                <header data-head className="px-1 pb-5 sm:pb-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary">{chapter.name}</p>
                  <h3 className="mt-2 font-display text-[24px] font-semibold leading-tight tracking-tight sm:text-[30px]">{chapter.title}</h3>
                </header>
              </Lift>
              <div className={cn("grid gap-4", chapter.columns === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3")}>
                {chapter.features.map((feature, order) => (
                  <Lift key={feature.label} order={order} className={cn(feature.wide && "lg:col-span-2")}>
                    <Tile
                      feature={feature}
                      max={demoMax(chapter)}
                      card={STARTS[index] + order}
                      staged={staged}
                      playing={playing === STARTS[index] + order}
                      onHold={hold}
                      onRelease={release}
                      onTake={take}
                      onLength={note}
                    />
                  </Lift>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
