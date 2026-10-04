/**
 * The hero's glass card: Singularity's own project screen, standing in front of the hero's nebula (HeroNebula) and
 * filmed like a screen recording while a live session runs on a loop.
 *
 * Handles: the whole workspace as the app draws it (AppReplica's sidebar, project header, chat window, file tree,
 * editor and preview window, in the app's own classes), and one request after another played through it - the
 * request is typed and the pointer presses send, the turn arrives in the chat (the files read, the build steps
 * ticking, the edited files), the pointer switches to Code and the files stream into the editor, which scrolls as
 * they grow, the answer comes, the pointer switches to Preview and the app reloads with what the request changed -
 * a streak that resets at the runner's own midnight, a weekly chart, a dark theme, cheers on the leaderboard. The
 * script names the part each of those moments is about, and the camera (AppReplica's Screen) goes to it only where
 * the card is too small to show the whole screen legibly: on a desktop the card is wide enough that the camera
 * holds still on the whole workspace, which is what the owner asked for after the close-ups cut the code and the
 * chat; on a narrow card it moves between the parts.
 *
 * Everything is one clock (motion.ts's useStopwatch) that runs only while the card is on screen, cut into requests
 * of a fixed length; what is on screen, where the camera is and what the pointer is doing are all read off the time
 * into the request, so pausing and resuming is just the clock stopping. A turn that has finished stays in the
 * transcript above the one being played, keyed by its turn number so it is not rebuilt. During the landing intro
 * (intro.ts) that clock waits until the page goes live; the card opens downwards from its top edge, each of its own
 * layers clipped open from its top edge to its foot (CARD_UNFOLD) - clipped rather than faded, and each layer by
 * itself, since a wrapper that faded or clipped the glass would become its blur's backdrop root and show it unblurred
 * for the length of the opening - and its panels (sidebar, header, chat, work area; each marked data-cascade) then
 * rise in one after another. Before it opens, the line of light along its top edge draws out from the middle
 * (LINE_DRAW), so the card unrolls from a horizon. Under reduced motion the card shows a finished request, whole,
 * and holds still.
 *
 * That opening is the card's own entrance (entrance "own", which the first landing page uses). On the home page the
 * card is brought in by the sheet it stands on instead (entrance "sheet"): the card grows out of one square of the
 * hero's grid, scaled by the hero from that square's size to its own (components/landing/expansion.ts's revealApp,
 * which puts the scale on this card's root and fades the glass, and the line and the glow marked data-expand-trim),
 * so the card plays none of the opening above. Either way the film waits for playing: the home page holds it back
 * until the card has arrived, so a visitor never comes in part-way through a request they did not see begin, and
 * the film is never seen through a scale.
 *
 * onPulse is called PULSE_LEAD before each request begins. The home page's hero uses it to send a ripple from its
 * prompt across the sheet under it (HeroFabric), timed to reach this card as the request starts, so each build is
 * seen to be set off by an idea arriving; nothing here depends on it.
 *
 * The screen is laid out at the app's real size and fitted to the card (AppReplica's Screen): a wide card shows the
 * whole workspace, sidebar included; a narrower one drops the sidebar; and on a phone, where the whole would be far
 * too small to read, the camera never pulls all the way out - it rests on the chat and crosses to the work area and
 * back. The camera's stops that are not a control of the app's are plain markers laid over the stage (data-shot).
 * The card keeps its glass: the surround is a dark, blurred pane the nebula's heart glows through, thinnest at the
 * top, and the windows standing on it are the app's own, a little see-through (index.css, .hero-glass).
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import {
  Bubble,
  ChatWindow,
  ClubApp,
  Composer,
  EditorWindow,
  EditsTile,
  FileTreeWindow,
  Grow,
  PreviewWindow,
  Prose,
  ReadRow,
  Screen,
  Sidebar,
  StepsTile,
  TurnHead,
  UsageLine,
  WorkHeader,
  Working,
  type StepState,
} from "./AppReplica";
import { at, between, streamed, typed } from "./replica";
import { CARD_UNFOLD, CONTENT_RISE, EASE_UNROLL, INTRO, useIntroChildrenEntrance, useIntroEntrance, useIntroReached, useIntroStagger } from "./intro";
import { STILL, useInView, usePrefersReducedMotion, useStopwatch } from "./motion";

const REQUEST_MS = 18000;
const FOCUS = 600;
const TYPE = 1100;
const TYPE_EACH = 28;
const AIM = 2900;
const PRESS = 3300;
const SENT = 3450;
const CHAT = 3650;
const THINK = 3850;
const READ = 4500;
const PLAN = 5100;
const CODE = 5500;
const CODE_ON = CODE + 950;
const WRITE = 6700;
const WRITE_EACH = 1600;
const DONE = WRITE + WRITE_EACH * 2;
const BACK = DONE + 200;
const REPLY = BACK + 400;
const PREVIEW = 12000;
const PREVIEW_ON = PREVIEW + 950;
const LIVE = PREVIEW_ON + 750;
const CLOSE_IN = LIVE + 900;
const WIDE = 16600;
const TAP = 220;
const EDITOR_ROWS = 9;
const PULSE_LEAD = 700;
const LINE_DRAW: Keyframe[] = [
  { scale: "0 1", opacity: 0 },
  { scale: "1 1", opacity: 1 },
];
const LINE_PHASE = { at: INTRO.card.at - 280, for: 950 };

interface Request {
  prompt: string;
  reads: string[];
  steps: { label: string; path: string }[];
  files: { path: string; code: string[] }[];
  reply: string;
  focus: string;
  scroll: number;
}

const REQUESTS: Request[] = [
  {
    prompt: "Reset streaks at midnight in each runner's own timezone",
    reads: ["src/lib/streaks.ts", "src/pages/Dashboard.tsx"],
    steps: [
      { label: "Compare dates in the runner's timezone", path: "src/lib/streaks.ts" },
      { label: "Recount every streak", path: "src/pages/Dashboard.tsx" },
    ],
    files: [
      {
        path: "src/lib/streaks.ts",
        code: [
          "// A day is a day where the runner lives.",
          "export function dayKey(date: Date, zone: string) {",
          '  return date.toLocaleDateString("en-CA", {',
          "    timeZone: zone,",
          "  });",
          "}",
          "",
          "export function currentStreak(",
          "  runs: Run[],",
          "  zone: string,",
          ") {",
          "  const days = new Set(",
          "    runs.map((run) => dayKey(run.at, zone)),",
          "  );",
          "  let day = today(zone);",
          "  let streak = 0;",
          "  while (days.has(dayKey(day, zone))) {",
          "    streak += 1;",
          "    day = prev(day);",
          "  }",
          "  return streak;",
          "}",
        ],
      },
      {
        path: "src/pages/Dashboard.tsx",
        code: [
          'import { currentStreak } from "../lib/streaks";',
          "",
          "export function Dashboard() {",
          "  const streak = currentStreak(runs, user.zone);",
          "  return (",
          "    <main>",
          "      <StreakBadge days={streak} zone={user.zone} />",
          "      <StreakCalendar runs={runs} />",
          "      <Leaderboard club={club} />",
          "    </main>",
          "  );",
          "}",
        ],
      },
    ],
    reply: "Streaks now roll over at each runner's local midnight.",
    focus: "streak",
    scroll: 0,
  },
  {
    prompt: "Add a weekly distance chart under the streak",
    reads: ["src/pages/Dashboard.tsx"],
    steps: [
      { label: "Sum distance per day", path: "src/components/WeeklyChart.tsx" },
      { label: "Show the chart on the dashboard", path: "src/pages/Dashboard.tsx" },
    ],
    files: [
      {
        path: "src/components/WeeklyChart.tsx",
        code: [
          'import { totalsByDay } from "../lib/distance";',
          "",
          "export function WeeklyChart({ runs }: Props) {",
          "  const week = totalsByDay(runs, 7);",
          "  const longest = Math.max(...week, 1);",
          "  return (",
          '    <section className="chart">',
          "      <h2>This week · km</h2>",
          "      {week.map((km, day) => (",
          "        <Bar key={day} height={km / longest} />",
          "      ))}",
          "    </section>",
          "  );",
          "}",
        ],
      },
      {
        path: "src/pages/Dashboard.tsx",
        code: [
          'import { WeeklyChart } from "../components/WeeklyChart";',
          "",
          "export function Dashboard() {",
          "  const streak = currentStreak(runs, user.zone);",
          "  return (",
          "    <main>",
          "      <StreakBadge days={streak} zone={user.zone} />",
          "      <WeeklyChart runs={runs} />",
          "      <Leaderboard club={club} />",
          "    </main>",
          "  );",
          "}",
        ],
      },
    ],
    reply: "Added a seven-day distance chart right under your streak.",
    focus: "chart",
    scroll: 40,
  },
  {
    prompt: "Give it a dark theme with bigger numbers",
    reads: ["src/styles/theme.css", "tailwind.config.ts"],
    steps: [
      { label: "Swap the palette for a dark one", path: "src/styles/theme.css" },
      { label: "Scale up the streak numeral", path: "tailwind.config.ts" },
    ],
    files: [
      {
        path: "src/styles/theme.css",
        code: [
          ":root {",
          "  --bg: 30 11% 6%;",
          "  --card: 30 9% 10%;",
          "  --ink: 40 27% 96%;",
          "  --muted: 30 6% 66%;",
          "  --accent: 34 100% 62%;",
          "}",
          "",
          "body {",
          "  background: hsl(var(--bg));",
          "  color: hsl(var(--ink));",
          "}",
        ],
      },
      {
        path: "tailwind.config.ts",
        code: [
          "export default {",
          "  theme: {",
          "    extend: {",
          "      fontSize: {",
          '        streak: ["72px", { lineHeight: "1" }],',
          "      },",
          "      colors: {",
          '        accent: "hsl(var(--accent))",',
          "      },",
          "    },",
          "  },",
          "};",
        ],
      },
    ],
    reply: "Switched to a dark theme and made the streak count louder.",
    focus: "right-top",
    scroll: 0,
  },
  {
    prompt: "Let runners cheer each other on the leaderboard",
    reads: ["src/components/Leaderboard.tsx"],
    steps: [
      { label: "Store a cheer per runner per day", path: "src/lib/cheers.ts" },
      { label: "Add a cheer button to each row", path: "src/components/Leaderboard.tsx" },
    ],
    files: [
      {
        path: "src/lib/cheers.ts",
        code: [
          "// One cheer per runner, per day.",
          "export async function cheer(runnerId: string) {",
          "  const day = today();",
          "  const sent = await db.cheers.find({ runnerId, day });",
          "  if (sent) return sent;",
          "  return db.cheers.add({ runnerId, day });",
          "}",
          "",
          "export function cheersFor(runnerId: string) {",
          "  return db.cheers.count({ runnerId });",
          "}",
        ],
      },
      {
        path: "src/components/Leaderboard.tsx",
        code: [
          'import { cheer } from "../lib/cheers";',
          "",
          "export function Leaderboard({ club }: Props) {",
          "  return (",
          "    <ol>",
          "      {club.map((row) => (",
          "        <li key={row.id}>",
          "          <Runner row={row} />",
          "          <button onClick={() => cheer(row.id)}>",
          "            🔥 {row.cheers}",
          "          </button>",
          "        </li>",
          "      ))}",
          "    </ol>",
          "  );",
          "}",
        ],
      },
    ],
    reply: "Every leaderboard row now has a cheer button with a live count.",
    focus: "board",
    scroll: 150,
  },
];

const BASE_FILES = ["package.json", "index.html", "tailwind.config.ts", "src/App.tsx", "src/pages/Dashboard.tsx", "src/components/StreakCalendar.tsx", "src/components/Leaderboard.tsx", "src/lib/streaks.ts", "src/styles/theme.css"];
const COUNT = REQUESTS.length;

function Turn({ request, s }: { request: Request; s: number }) {
  if (s < SENT) return null;
  const writing = Math.floor((s - WRITE) / WRITE_EACH);
  const stateOf = (index: number): StepState => (s >= WRITE + (index + 1) * WRITE_EACH ? "done" : index === Math.max(0, writing) ? "active" : "pending");
  const reply = typed(request.reply, s, REPLY, 22);

  return (
    <>
      <Grow>
        <Bubble>{request.prompt}</Bubble>
      </Grow>
      {s >= THINK && (
        <Grow>
          <TurnHead thought={s >= DONE ? "Worked for 6s" : undefined} />
        </Grow>
      )}
      {between(s, THINK, READ) && (
        <Grow gap={false} className="pt-3">
          <Working />
        </Grow>
      )}
      {s >= READ && (
        <Grow gap={false} className="pt-3">
          <ReadRow files={request.reads} active={s < PLAN} />
        </Grow>
      )}
      {s >= PLAN && (
        <Grow gap={false} className="pt-3">
          <StepsTile steps={request.steps.map((step, index) => ({ ...step, state: stateOf(index) }))} />
        </Grow>
      )}
      {s >= WRITE && (
        <Grow gap={false} className="pt-3">
          <EditsTile files={request.files.filter((_, index) => s >= WRITE + index * WRITE_EACH).map((file, index) => ({ path: file.path, active: stateOf(index) !== "done" }))} />
        </Grow>
      )}
      {s >= REPLY && (
        <Grow gap={false} className="pt-3">
          <Prose>{reply}</Prose>
        </Grow>
      )}
    </>
  );
}

const OPENING_STEPS = [
  { label: "Count streaks from logged runs", path: "src/lib/streaks.ts" },
  { label: "Draw the streak calendar", path: "src/components/StreakCalendar.tsx" },
  { label: "Rank the club on a leaderboard", path: "src/components/Leaderboard.tsx" },
  { label: "Put it together on the dashboard", path: "src/pages/Dashboard.tsx" },
].map((step) => ({ ...step, state: "done" as const }));

function Opening() {
  return (
    <div className="space-y-3 pt-5">
      <Bubble>A habit tracker for my running club, with streaks and a leaderboard</Bubble>
      <TurnHead thought="Worked for 48s" />
      <StepsTile steps={OPENING_STEPS} />
      <Prose>Your running club tracker is ready. Open the Preview to try it, or ask for a change.</Prose>
    </div>
  );
}

const flagsFor = (level: number) => ({ zone: level >= 0, chart: level >= 1, dark: level >= 2, cheers: level >= 3 });

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export function AppGlassCard({ onPulse, entrance = "own", playing = true }: { onPulse?: () => void; entrance?: "own" | "sheet"; playing?: boolean } = {}) {
  const reduced = usePrefersReducedMotion();
  const [ref, visible] = useInView<HTMLDivElement>({ once: false, threshold: 0.2, rootMargin: "0px" });
  const layers = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const none = useRef<HTMLDivElement>(null);
  const brought = entrance === "sheet";
  useIntroChildrenEntrance(brought ? none : layers, CARD_UNFOLD, INTRO.card, EASE_UNROLL);
  useIntroEntrance(brought ? none : line, LINE_DRAW, LINE_PHASE);
  useIntroStagger(brought ? none : pane, "[data-cascade]", CONTENT_RISE, INTRO.content, INTRO.contentStep);
  const arrived = useIntroReached(INTRO.live);
  const width = useWidth(ref);
  const t = useStopwatch(visible && arrived && playing, reduced);
  const clock = t === STILL ? REQUEST_MS + WIDE : t;
  const turn = Math.floor(clock / REQUEST_MS);
  const level = turn % COUNT;
  const s = clock % REQUEST_MS;
  const soon = t !== STILL && s >= REQUEST_MS - PULSE_LEAD;

  useEffect(() => {
    if (soon) onPulse?.();
  }, [soon, onPulse]);
  const request = REQUESTS[level];
  const before = (level + COUNT - 1) % COUNT;

  const narrow = width > 0 && width < 700;
  const sidebar = !narrow && width / 0.9 >= 1280;
  const home = narrow ? "chat-foot" : null;
  const coding = s >= CODE_ON && s < PREVIEW_ON;
  const reloading = between(s, PREVIEW_ON, LIVE);
  const live = s >= LIVE;
  const shown = live ? level : turn > 0 ? before : -1;
  const since = live ? s - LIVE : s + REQUEST_MS;
  const fileIndex = Math.min(request.files.length - 1, Math.max(0, Math.floor((s - WRITE) / WRITE_EACH)));
  const file = request.files[fileIndex];
  const lines = streamed(file.code, (s - WRITE - fileIndex * WRITE_EACH) / (WRITE_EACH - 250));
  const streaming = s >= WRITE && s < DONE;
  const written = request.files.filter((_, index) => s >= WRITE + index * WRITE_EACH).map((item) => item.path);
  const files = [...new Set([...BASE_FILES, ...REQUESTS.slice(0, level).flatMap((item) => item.files.map((entry) => entry.path)), ...written])];
  const working = s >= SENT && s < REPLY + 1300;
  const pressed = between(s, PRESS, PRESS + TAP) || between(s, CODE + 850, CODE + 850 + TAP) || between(s, PREVIEW + 850, PREVIEW + 850 + TAP);
  const cursor = at<string | null>(s, [
    [0, null],
    [FOCUS, "prompt"],
    [AIM, "send"],
    [SENT + 450, null],
    [CODE, "tab-code"],
    [CODE + 1500, null],
    [PREVIEW, "tab-preview"],
    [PREVIEW + 1500, null],
  ]);
  const shot = reduced
    ? home
    : at<string | null>(s, [
        [0, home],
        [FOCUS, "composer"],
        [CHAT, "chat-foot"],
        [CODE, "right-top"],
        [BACK, "chat-foot"],
        [PREVIEW, "right-top"],
        [CLOSE_IN, request.focus],
        [WIDE, home],
      ]);

  return (
    <div
      ref={(node) => {
        ref.current = node;
        layers.current = node;
      }}
      className="relative"
    >
      <div
        ref={line}
        aria-hidden="true"
        data-expand-trim="1"
        className="absolute -top-px left-1/2 z-20 h-px w-[80%] -translate-x-1/2 bg-gradient-to-r from-transparent via-[hsl(40_39.7%_93.4%)] to-transparent"
      />
      <div
        aria-hidden="true"
        data-expand-trim="0.8"
        className="absolute -top-10 left-1/2 z-0 h-24 w-[70%] -translate-x-1/2 rounded-[50%] opacity-80"
        style={{ backgroundImage: "radial-gradient(closest-side, hsl(42.4 99.6% 85% / 0.34), transparent)" }}
      />
      <Screen
        ref={pane}
        base={(view) => (view < 700 ? view / 830 : view / Math.min(1440, Math.max(1100, view / 0.9)))}
        pad={12}
        shot={shot}
        cursor={reduced ? null : cursor}
        press={pressed}
        className="hero-glass z-10 h-[500px] rounded-2xl border border-white/[0.09] bg-[linear-gradient(to_bottom,hsl(30_11%_3.7%/0.46),hsl(30_11%_3.7%/0.7)_35%,hsl(30_11%_3.7%/0.88)_70%)] shadow-[0_60px_120px_-40px_rgb(0_0_0/0.95)] backdrop-blur-[32px] backdrop-saturate-150 sm:h-[570px] 2xl:h-[640px]"
      >
        <div className="flex h-full">
          <div className={sidebar ? "contents" : "hidden"}>
            <Sidebar busy={working} />
          </div>
          <div className="relative flex min-w-0 flex-1 flex-col">
            <WorkHeader mode={coding ? "code" : "preview"} live={!reloading} />
            <div className={cn("flex min-h-0 flex-1 gap-2 pb-2 pr-2", !sidebar && "pl-2")}>
              <ChatWindow
                className={narrow ? "w-1/2" : "w-[35%]"}
                footer={
                  <>
                    <UsageLine percent={38 + level * 6 + (s >= REPLY ? 6 : 0)} used={`${760 + level * 40 + (s >= REPLY ? 24 : 0)}k`} streaming={working} />
                    <Composer text={s < SENT ? typed(request.prompt, s, TYPE, TYPE_EACH) : ""} focus={between(s, FOCUS + 300, SENT)} working={working} press={between(s, PRESS, PRESS + TAP)} />
                  </>
                }
              >
                {turn === 0 ? <Opening key="opening" /> : <Turn key={turn - 1} request={REQUESTS[before]} s={REQUEST_MS} />}
                <Turn key={turn} request={request} s={s} />
              </ChatWindow>
              <div className="relative min-w-0 flex-1">
                <div className={cn("absolute inset-0 flex gap-2", !coding && "hidden")}>
                  <FileTreeWindow className={cn("w-[216px]", narrow && "hidden")} files={files} selected={file.path} changed={written} writing={streaming ? file.path : undefined} />
                  <EditorWindow
                    className="flex-1"
                    tabs={written.length > 0 ? written : [file.path]}
                    active={file.path}
                    lines={lines}
                    caret={streaming}
                    current={lines.length - 1}
                    top={Math.max(0, lines.length - EDITOR_ROWS)}
                    dots={written}
                  />
                </div>
                <PreviewWindow className={cn("absolute inset-0", coding && "hidden")} state="live" reloading={reloading}>
                  <ClubApp t={since} {...flagsFor(shown)} scroll={shown >= 0 ? REQUESTS[shown].scroll : 0} />
                </PreviewWindow>
              </div>
            </div>
            <span data-shot="chat-foot" className="pointer-events-none absolute bottom-0 left-0" style={{ width: narrow ? "50%" : "48%", height: narrow ? "50%" : "72%" }} />
            <span data-shot="right-top" className="pointer-events-none absolute right-0 top-0" style={{ width: narrow ? "50%" : "58%", height: narrow ? "50%" : "72%" }} />
          </div>
        </div>
      </Screen>
    </div>
  );
}
