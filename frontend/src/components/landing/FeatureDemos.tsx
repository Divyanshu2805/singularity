/**
 * The feature demos: thirteen small looping films, one per feature, each showing the feature being used on the app's
 * own screen rather than describing it.
 *
 * Handles: the stage every film plays on (Demo - one fixed height, so the cards in a row line up; AppReplica's
 * Screen, laid out at the app's size and filmed by its camera), and the films themselves - the idea interview on the
 * dashboard (the prompt typed, a question answered, several screens ticked, the plan reviewed), files streaming into
 * the tree and the editor, the last turn's changes shown as a diff, a preview booting step by step and then
 * hot-reloading with its output drawer open, a runtime error handed back to the chat and fixed, teaching mode picked
 * from the prompt's menu and a step's "How it works" note opened and followed to its line, ExplainLLM asked about a
 * selected line, a search across the project's code jumping to a match and the Ctrl K palette hopping to another
 * project, a collaborator invited from the share panel, a project forked into a copy with a fresh chat, the project
 * downloaded as a ZIP, the usage page switching range and scrolling to the per-project breakdown, and the security
 * page turning two-step verification on and signing out everywhere.
 *
 * Every film is a pure function of one looping clock (motion.ts's useDemoClock), so it only runs while on screen
 * and pausing is the clock stopping. A film names, for each moment, the part of the screen the camera should be on
 * (a data-shot name, or nothing for the whole screen) and the control the pointer is at; the camera glides between
 * those by a CSS transition, since the clock ticks only every 80ms. Under reduced motion the clock is pinned past the
 * end, and every film is written so that clamped time lands on its finished frame, shown whole.
 *
 * The stage is small, but a film is shown whole: the camera (AppReplica's Screen) goes in on the part a film names
 * only as far as the window it sits in still fits, and closer only while the pointer is on a control too small to
 * see - the films used to spend most of their time close in, which cut the code and the menus they were showing.
 * A chat window and a file tree that only a wide
 * card has room for are marked .replica-wide and drop out of a narrow one (index.css, a container query on the
 * canvas). Claims are held to what the app does today: the preview steps are lib/preview's, the roles are "Can edit"
 * and "Can view" as the share panel names them, ExplainLLM reads the file before it answers and never edits, and
 * two-step verification is an authenticator app. FeatureDeck shows all thirteen.
 */
import type { ReactNode, RefObject } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, CornerDownLeft, FileArchive, GitCompare, GitFork, GraduationCap, Hammer, Link2, Lock, LogOut, Mail, Search, ShieldCheck, Smartphone, SquareTerminal, Wrench, X } from "lucide-react";
import { HorizonMark } from "@/components/HorizonMark";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { getFileColor, getFileIcon, splitPath } from "@/lib/file-icons";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Bubble,
  Caret,
  ChatWindow,
  Clarifier,
  ClubApp,
  Composer,
  DashPrompt,
  EditorWindow,
  FileTreeWindow,
  Grow,
  IdeaChips,
  Kbd,
  LensWindow,
  PreviewWindow,
  Prose,
  Screen,
  StepsTile,
  Swatch,
  TurnHead,
  UsageLine,
  WorkHeader,
  Working,
  type Question,
  type StepState,
} from "./AppReplica";
import { at, between, type CodeLine, ease, PEOPLE, span, streamed, typed, whole } from "./replica";
import { useDemoClock } from "./motion";

function Demo({ stage, shot, cursor = null, press = false, children }: { stage: RefObject<HTMLDivElement>; shot: string | null; cursor?: string | null; press?: boolean; children: ReactNode }) {
  return (
    <Screen ref={stage} base={0.44} pad={10} glide={950} shot={shot} cursor={cursor} press={press} className="demo-stage h-[196px] rounded-xl">
      {children}
    </Screen>
  );
}

function Windows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("ws-stage relative flex h-full gap-2 p-2", className)}>{children}</div>;
}

const IDEA = "A habit tracker for my running club";
const PROJECT = ["package.json", "index.html", "src/App.tsx", "src/pages/Dashboard.tsx", "src/components/StreakCalendar.tsx", "src/components/Leaderboard.tsx", "src/lib/streaks.ts"];
const STREAKS = [
  "// Count the days in a row with a run.",
  "export function currentStreak(runs: Run[]) {",
  "  const days = new Set(runs.map(dayKey));",
  "  let day = today();",
  "  let streak = 0;",
  "  while (days.has(dayKey(day))) {",
  "    streak += 1;",
  "    day = prev(day);",
  "  }",
  "  return streak;",
  "}",
];
const BOARD = [
  'import { Row } from "./Row";',
  "",
  "export function Leaderboard({ club }: Props) {",
  "  const top = sortBy(club, (runner) => -runner.streak);",
  "  return (",
  "    <ol>",
  "      {top.map((runner) => (",
  "        <Row key={runner.id} runner={runner} />",
  "      ))}",
  "    </ol>",
  "  );",
  "}",
];
const DASHBOARD = [
  'import { currentStreak } from "../lib/streaks";',
  "",
  "export function Dashboard() {",
  "  const streak = currentStreak(runs);",
  "  return (",
  "    <main>",
  "      <StreakBadge days={streak} />",
  "      <Leaderboard club={club} />",
  "    </main>",
  "  );",
  "}",
];
const BUILT_STEPS = [
  { label: "Count streaks from logged runs", path: "src/lib/streaks.ts" },
  { label: "Rank the club on a leaderboard", path: "src/components/Leaderboard.tsx" },
  { label: "Put it together on the dashboard", path: "src/pages/Dashboard.tsx" },
].map((step) => ({ ...step, state: "done" as StepState }));

function BuiltTurn() {
  return (
    <div className="space-y-3 pt-5">
      <TurnHead thought="Worked for 31s" />
      <StepsTile steps={BUILT_STEPS} />
      <Prose>Your running club tracker is ready.</Prose>
    </div>
  );
}

const QUIZ: Question[] = [
  { ask: "Who is this for?", helper: "Knowing your users shapes every screen.", options: ["Just me", "My running club", "Coaches", "The general public"] },
  { ask: "What must runners be able to do?", helper: "Everything else gets built around this.", options: ["Log a run", "Plan races", "Chat", "Share a route"] },
  { ask: "Which screens does it need?", helper: "Pick any that apply.", options: ["Dashboard", "Streak calendar", "Leaderboard", "Settings"], multi: true },
  { ask: "What should it feel like?", helper: "A style reference helps the design land.", options: ["Warm and minimal", "Bold", "Dark and techy", "Playful"] },
];
const QUIZ_ANSWERS = ["My running club", "Log a run", "Dashboard, Streak calendar, Leaderboard", "Warm and minimal"];

export function InterviewDemo() {
  const [ref, t] = useDemoClock(11000);
  const sent = t >= 2250;
  const index = t >= 4400 ? 2 : 0;
  const picked = index === 0 ? (t >= 3750 ? [1] : []) : [0, 1, 2].filter((option) => t >= 4950 + option * 450);

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [300, "prompt"],
        [2350, "clarifier"],
        [3000, "question"],
        [6800, "plan"],
        [9600, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [250, "prompt"],
        [1750, "send"],
        [2500, null],
        [3150, "option-1"],
        [4400, null],
        [4600, "option-0"],
        [5150, "option-1"],
        [5600, "option-2"],
        [6500, null],
      ])}
      press={between(t, 2050, 2270) || between(t, 3650, 3850) || between(t, 4850, 5050) || between(t, 5300, 5500) || between(t, 5750, 5950)}
    >
      <div className="replica-sky flex h-full flex-col items-center px-6 pt-7">
        <div className="w-full max-w-[470px]">
          {sent ? (
            <Clarifier idea={IDEA} questions={QUIZ} index={index} picked={picked} phase={t < 2950 ? "loading" : t >= 8600 ? "compiling" : t >= 6700 ? "review" : "asking"} answers={QUIZ_ANSWERS} />
          ) : (
            <>
              <DashPrompt text={typed(IDEA, t, 500, 32)} focus={t >= 350} press={between(t, 2050, 2270)} />
              <IdeaChips />
            </>
          )}
        </div>
      </div>
    </Demo>
  );
}

const WRITES = [
  { path: "src/lib/streaks.ts", code: STREAKS },
  { path: "src/components/Leaderboard.tsx", code: BOARD },
];
const WRITE_MS = 4200;

export function StreamDemo() {
  const [ref, t] = useDemoClock(WRITES.length * WRITE_MS + 1600);
  const done = t >= WRITES.length * WRITE_MS;
  const active = Math.min(WRITES.length - 1, Math.floor(t / WRITE_MS));
  const local = t - active * WRITE_MS;
  const file = WRITES[active];
  const lines = streamed(file.code, (local - 750) / (WRITE_MS - 1400));
  const started = WRITES.slice(0, active + 1).map((item) => item.path);

  return (
    <Demo stage={ref} shot={done ? null : local < 250 && active === 0 ? null : local < 800 ? "tree-top" : "code"}>
      <Windows>
        <FileTreeWindow files={["package.json", "src/App.tsx", ...started]} selected={file.path} changed={started} writing={done ? undefined : file.path} />
        <EditorWindow className="flex-1" tabs={started} active={file.path} lines={lines} caret={!done} current={lines.length - 1} top={Math.max(0, lines.length - 6)} dots={started} />
      </Windows>
    </Demo>
  );
}

const AFTER: CodeLine[] = [{ text: "export function currentStreak(runs: Run[]) {" }, { text: "  const days = new Set(runs.map(dayKey));" }, { text: "  return walkBack(days, today());" }, { text: "}" }];
const DIFF: CodeLine[] = [
  { text: "export function currentStreak(runs: Run[]) {", n: 1 },
  { text: "  return runs.length;", tone: "del", n: 2 },
  { text: "  const days = new Set(runs.map(dayKey));", tone: "add", n: 2 },
  { text: "  return walkBack(days, today());", tone: "add", n: 3 },
  { text: "}", n: 4 },
];

export function DiffDemo() {
  const [ref, t] = useDemoClock(8200);
  const opened = t >= 1150;
  const on = t >= 2400;

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [450, "tree-top"],
        [1450, "code"],
        [7000, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [450, "file-streaks.ts"],
        [1700, "diff"],
        [3100, null],
      ])}
      press={between(t, 1000, 1200) || between(t, 2250, 2450)}
    >
      <Windows>
        <FileTreeWindow files={PROJECT} selected={opened ? "src/lib/streaks.ts" : "src/pages/Dashboard.tsx"} changed={["src/lib/streaks.ts"]} />
        <EditorWindow
          className="flex-1"
          tabs={opened ? ["src/pages/Dashboard.tsx", "src/lib/streaks.ts"] : ["src/pages/Dashboard.tsx"]}
          active={opened ? "src/lib/streaks.ts" : "src/pages/Dashboard.tsx"}
          dots={on ? [] : ["src/lib/streaks.ts"]}
          lines={on ? DIFF : opened ? AFTER : whole(DASHBOARD)}
          overlay={
            opened && (
              <span data-cur="diff" data-active={on} data-press={between(t, 2250, 2450) || undefined} className="icon-btn app-menu absolute right-3 top-3 z-10 h-8 w-8 border">
                <GitCompare className="h-4 w-4" />
              </span>
            )
          }
        />
      </Windows>
    </Demo>
  );
}

const LOG = ["$ npm install", "added 214 packages in 9s", "$ npm run dev", "  VITE v5.4.2  ready in 412 ms", "  ➜  Local:   http://localhost:5173/"];
const BOOT_EACH = 700;
const RUNNING = 300 + BOOT_EACH * 4;

export function PreviewDemo() {
  const [ref, t] = useDemoClock(11500);
  const live = t >= RUNNING;
  const output = between(t, 4900, 7300);
  const reloaded = t >= 7900;

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [500, "boot"],
        [RUNNING + 200, "streak"],
        [5000, "logs"],
        [7400, "preview"],
        [8100, "chart"],
        [10300, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [4200, "output"],
        [5400, null],
      ])}
      press={between(t, 4750, 4950)}
    >
      <Windows>
        <ChatWindow
          className="replica-wide w-[520px] shrink-0"
          footer={
            <>
              <UsageLine percent={31} used="620k" />
              <Composer />
            </>
          }
        >
          <BuiltTurn />
        </ChatWindow>
        <PreviewWindow
          className="flex-1"
          state={live ? "live" : "starting"}
          step={Math.min(3, Math.floor((t - 300) / BOOT_EACH))}
          seconds={Math.round(Math.max(0, t - 300) / 230)}
          reloading={between(t, 7400, 7900)}
          drawer={
            output && (
              <div data-shot="logs" className="chat-enter flex h-[150px] shrink-0 flex-col bg-[hsl(var(--ws-well))]">
                <div className="ws-bar ws-bar-top flex h-9 shrink-0 items-center gap-2 px-3 text-[11px] font-medium text-foreground/85">
                  <SquareTerminal className="h-3.5 w-3.5" />
                  Output
                  <span className="flex items-center gap-1.5 font-normal text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-syntax-string" />
                    live
                  </span>
                  <X className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <pre className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap p-3 font-mono text-[11.5px] leading-[1.6] text-foreground/80">
                  {LOG.slice(0, Math.max(0, Math.floor((t - 5000) / 260))).join("\n")}
                </pre>
              </div>
            )
          }
        >
          <ClubApp t={reloaded ? t - 7900 : t - RUNNING} chart={reloaded} />
        </PreviewWindow>
      </Windows>
    </Demo>
  );
}

function ErrorAlert({ press }: { press: boolean }) {
  return (
    <div data-shot="alert" className="chat-enter absolute bottom-3 right-3 z-20 w-[350px]">
      <div className="app-menu overflow-hidden rounded-2xl border !p-0">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
              <AlertCircle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <h3 className="font-display text-[16px] font-semibold tracking-tight text-foreground">The preview hit an error</h3>
              <p className="text-xs text-muted-foreground">1 error found</p>
            </div>
          </div>
          <X className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-start gap-2 p-4 text-foreground/85">
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">Runtime error</span>
              <span className="text-xs text-muted-foreground">on streaks.ts</span>
            </div>
            <p className="font-mono text-xs leading-relaxed">TypeError: runs is undefined</p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/15 px-3 py-2.5">
          <span className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
            Dismiss <Kbd>Esc</Kbd>
          </span>
          <span data-cur="fix" data-press={press || undefined} className="btn btn-primary inline-flex h-8 items-center gap-2 rounded-full px-4 text-xs font-semibold">
            <Wrench className="h-3.5 w-3.5" />
            Fix issues
          </span>
        </div>
      </div>
    </div>
  );
}

export function FixDemo() {
  const [ref, t] = useDemoClock(10000);
  const broken = between(t, 900, 6200);
  const sent = t >= 2450;
  const fixed = t >= 5200;

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [1050, "alert"],
        [2600, "talk"],
        [5700, "streak"],
        [8600, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [1500, "fix"],
        [2700, null],
      ])}
      press={between(t, 2250, 2470)}
    >
      <Windows>
        <ChatWindow className="w-[330px] shrink-0" footer={<Composer working={sent && !fixed} />}>
          <BuiltTurn />
          {sent && (
            <Grow>
              <Bubble>Fix this error: TypeError: runs is undefined (streaks.ts, line 3)</Bubble>
            </Grow>
          )}
          {t >= 2900 && (
            <Grow>
              <TurnHead thought={fixed ? "Worked for 9s" : undefined} />
            </Grow>
          )}
          {between(t, 2900, 3500) && (
            <Grow gap={false} className="pt-3">
              <Working />
            </Grow>
          )}
          {t >= 3500 && (
            <Grow gap={false} className="pt-3">
              <StepsTile steps={[{ label: "Handle a runner with no runs", path: "src/lib/streaks.ts", state: fixed ? "done" : "active" }]} />
            </Grow>
          )}
          {fixed && (
            <Grow gap={false} className="pt-3">
              <Prose>Fixed - a new runner now starts at zero.</Prose>
            </Grow>
          )}
        </ChatWindow>
        <PreviewWindow className="flex-1" state="live" reloading={between(t, 5600, 6200)} extra={between(t, 1000, 2450) && <ErrorAlert press={between(t, 2250, 2470)} />}>
          <ClubApp t={t >= 6200 ? t - 6200 : t} broken={broken} />
        </PreviewWindow>
      </Windows>
    </Demo>
  );
}

function ModeMenu({ teaching, hover }: { teaching: boolean; hover: boolean }) {
  return (
    <div className="app-menu app-menu-raised chat-enter absolute bottom-full right-0 z-30 mb-2 w-48 rounded-2xl border">
      {(
        [
          ["Build", Hammer, false],
          ["Teach me", GraduationCap, true],
        ] as const
      ).map(([label, Icon, value]) => (
        <div key={label} role="menuitem" data-cur={value ? "teach" : undefined} data-current={value === teaching} data-highlighted={value && hover ? "" : undefined} className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium">
          <Icon className="h-4 w-4" />
          <span className="flex-1">{label}</span>
          {value === teaching && <Check className="h-4 w-4" />}
        </div>
      ))}
    </div>
  );
}

export function TeachingDemo() {
  const [ref, t] = useDemoClock(10000);
  const teaching = t >= 1850;

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [300, "mode-zone"],
        [2500, "steps"],
        [3950, "lesson"],
        [6350, "pick"],
        [9000, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [350, "mode"],
        [1250, "teach"],
        [2300, null],
        [2800, "lesson"],
        [4300, null],
        [5300, "ref"],
        [6900, null],
      ])}
      press={between(t, 850, 1050) || between(t, 1750, 1950) || between(t, 3300, 3500) || between(t, 6000, 6200)}
    >
      <Windows>
        <ChatWindow
          className="w-[340px] shrink-0"
          footer={
            <div className="relative">
              <span data-shot="mode-zone" className="pointer-events-none absolute inset-x-0 -top-[104px] bottom-0" />
              <Composer teaching={teaching} modeCur="mode" modePress={between(t, 850, 1050)} menu={between(t, 950, 2100) && <ModeMenu teaching={teaching} hover={t >= 1500} />} />
            </div>
          }
        >
          <div className="space-y-3 pt-5">
            <TurnHead thought="Worked for 31s" />
            <StepsTile
              steps={BUILT_STEPS}
              lesson={
                teaching
                  ? {
                      index: 0,
                      open: t >= 3450,
                      concept: "Set",
                      text: "keeps each day once, so “did they run that day?” is answered in a single step.",
                      code: "const days = new Set(runs.map(dayKey));",
                      line: 3,
                    }
                  : undefined
              }
            />
          </div>
        </ChatWindow>
        <EditorWindow className="flex-1" tabs={["src/lib/streaks.ts"]} active="src/lib/streaks.ts" lines={STREAKS.map((text, order) => ({ text, tone: order === 2 && t >= 6150 ? "flash" : undefined }))} />
      </Windows>
    </Demo>
  );
}

const ASKED = "Why loop backwards from today?";
const ANSWER = "A streak ends at the first missing day, so walking back from today finds it in one pass - no sorting, and no reading runs it doesn’t need.";

export function ExplainDemo() {
  const [ref, t] = useDemoClock(11500);
  const open = t >= 1500;
  const asked = t >= 3450;
  const answer = typed(ANSWER, t, 4500, 18);

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [300, "code"],
        [900, "pick"],
        [1900, "ask"],
        [3550, "answer-zone"],
        [10300, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [200, "line-6"],
        [1050, "lens"],
        [1800, "ask"],
        [3050, "lens-send"],
        [3700, null],
      ])}
      press={between(t, 700, 900) || between(t, 1400, 1600) || between(t, 3300, 3500)}
    >
      <Windows>
        <FileTreeWindow className="replica-wide" files={PROJECT} selected="src/lib/streaks.ts" />
        <EditorWindow className="flex-1" tabs={["src/lib/streaks.ts"]} active="src/lib/streaks.ts" lens={open} lines={STREAKS.map((text, order) => ({ text, tone: order === 5 && t >= 800 ? "pick" : undefined }))} />
        {open && (
          <LensWindow
            selection={{ file: "streaks.ts", lines: "L6" }}
            asking={asked ? "" : typed(ASKED, t, 2100, 36)}
            question={asked ? ASKED : undefined}
            reading={asked && t < 4300}
            read={t >= 4300 ? "src/lib/streaks.ts" : undefined}
            answer={t >= 4500 ? answer : undefined}
            done={answer.length >= ANSWER.length}
            press={between(t, 3300, 3500)}
          />
        )}
      </Windows>
    </Demo>
  );
}

const QUERY = "streak";
const HITS = [
  { path: "src/lib/streaks.ts", matches: [{ line: 2, before: "export function current", mark: "Streak", after: "(runs: Run[]) {" }] },
  { path: "src/pages/Dashboard.tsx", matches: [{ line: 4, before: "const ", mark: "streak", after: " = currentStreak(runs);", cur: "hit" }] },
  { path: "src/components/Leaderboard.tsx", matches: [{ line: 4, before: "sortBy(club, (runner) => -runner.", mark: "streak", after: ")" }] },
];
const OTHER_PROJECTS = [
  { name: "recipe-box", when: "5 hours ago" },
  { name: "study-planner", when: "yesterday" },
];

function SearchResults({ picked }: { picked: boolean }) {
  return (
    <>
      <p className="px-2 pb-1.5 text-[10.5px] text-muted-foreground">3 matches in 3 files</p>
      {HITS.map((file) => {
        const Icon = getFileIcon(file.path);
        const { dir, base } = splitPath(file.path);
        return (
          <div key={file.path} className="chat-enter pb-1">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-foreground/80">
              <Icon className={cn("h-3 w-3 shrink-0", getFileColor(file.path))} />
              <span className="truncate font-medium">{base}</span>
              <span className="truncate text-muted-foreground">{dir}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{file.matches.length}</span>
            </div>
            {file.matches.map((match) => (
              <div key={match.line} data-cur={"cur" in match ? match.cur : undefined} data-selected={"cur" in match && picked} className="hl-row flex items-baseline gap-2 rounded-md px-2 py-0.5 pl-6">
                <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/80">{match.line}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {match.before}
                  <mark className="rounded-sm bg-primary/30 px-px text-white">{match.mark}</mark>
                  {match.after}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Palette({ query, entered }: { query: string; entered: boolean }) {
  return (
    <div className="chat-enter absolute inset-0 z-30 flex items-start justify-center bg-black/55 pt-9">
      <div data-shot="palette" className="app-menu app-menu-raised w-[470px] overflow-hidden rounded-2xl border !p-0">
        <div className="flex h-[3.25rem] items-center gap-3 border-b border-white/[0.07] px-4">
          <Search className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-[15px] text-foreground">
            {query || <span className="text-muted-foreground/70">Search projects or jump to a page…</span>}
            <Caret />
          </span>
        </div>
        <p className="sidebar-label px-4 pb-1 pt-3">Projects</p>
        <div className="space-y-0.5 px-2 pb-2">
          {OTHER_PROJECTS.filter((project) => project.name.startsWith(query.slice(0, 3)) || query.length < 2).map((project, order) => (
            <div key={project.name} data-press={(order === 0 && entered) || undefined} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-transform", order === 0 ? "row-active" : "text-foreground/85")}>
              <Swatch name={project.name} className="h-5 w-5" />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{project.when}</span>
              {order === 0 && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-white/[0.06] bg-black/20 px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> open
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

export function SearchDemo() {
  const [ref, t] = useDemoClock(10500);
  const query = typed(QUERY, t, 700, 100);
  const jumped = t >= 2950;
  const hopped = t >= 7300;
  const project = hopped ? "recipe-box" : "running-club";

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [300, "find"],
        [1550, "tree-top"],
        [3150, "pick"],
        [5300, "palette"],
        [7450, "name"],
        [9300, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [250, "find"],
        [2200, "hit"],
        [3500, null],
      ])}
      press={between(t, 2750, 2970)}
    >
      <div className="ws-stage relative flex h-full flex-col">
        <WorkHeader mode="code" name={project} people={hopped ? 1 : 3} />
        <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
          <FileTreeWindow
            files={PROJECT}
            selected="src/pages/Dashboard.tsx"
            query={
              query && !hopped ? (
                <span className="text-foreground">
                  {query}
                  {t < 2950 && <Caret />}
                </span>
              ) : undefined
            }
            results={query.length >= 3 && !hopped ? <SearchResults picked={jumped} /> : undefined}
          />
          <EditorWindow
            className="flex-1"
            tabs={["src/pages/Dashboard.tsx"]}
            active="src/pages/Dashboard.tsx"
            lines={DASHBOARD.map((text, order) => ({ text, tone: order === 3 && jumped && !hopped ? "flash" : undefined }))}
          />
        </div>
        {between(t, 5300, 7300) && <Palette query={typed("rec", t, 5700, 130)} entered={between(t, 6900, 7300)} />}
      </div>
    </Demo>
  );
}

const INVITE = "sam@club.dev";

function RoleChip({ role }: { role: string }) {
  return (
    <span className="app-chip inline-flex h-8 shrink-0 items-center gap-1.5 border px-3 text-xs font-medium">
      {role}
      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
    </span>
  );
}

function SharePanel({ email, typing, invited, press }: { email: string; typing: boolean; invited: boolean; press: boolean }) {
  const people = invited ? PEOPLE : PEOPLE.slice(0, 2);
  return (
    <div className="app-menu app-menu-raised chat-enter absolute right-2 top-1 z-30 w-[420px] overflow-hidden rounded-2xl border !p-0">
      <div data-shot="invite" className="px-4 pb-4 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[19px] font-semibold tracking-tight">Share project</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Invite people to build this with you.</p>
          </div>
          <span className="btn btn-glass inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold">
            <Link2 className="h-3.5 w-3.5" />
            Copy link
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div data-cur="email" className={cn("app-field flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border pl-3.5 pr-2 text-sm", typing && "!border-primary/60")}>
            <Mail className="h-4 w-4 shrink-0 text-primary/80" />
            <span className="min-w-0 flex-1 truncate">
              {email || <span className="text-muted-foreground">Email</span>}
              {typing && <Caret />}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
              Can edit
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </span>
          </div>
          <button type="button" tabIndex={-1} disabled={!email} data-cur="invite" data-press={press || undefined} className="app-send h-10 w-auto px-4 text-sm font-semibold">
            Invite
          </button>
        </div>
      </div>
      <div data-shot="people" className="border-t border-white/[0.07] px-4 py-3">
        <p className="flex items-center justify-between">
          <span className="app-label">People with access</span>
          <span className="rounded-md bg-white/[0.07] px-1.5 text-[11px] tabular-nums text-muted-foreground">{people.length}</span>
        </p>
        <ul className="mt-2">
          {people.map((person, order) => (
            <li key={person.email} className={cn(order === 2 && "replica-grow")}>
              <div className="flex min-h-0 items-center gap-3 py-1.5">
                <Avatar person={person} className="h-8 w-8 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">
                    {person.name} {order === 0 && <span className="font-normal text-muted-foreground">(You)</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{person.email}</span>
                </span>
                {order === 0 ? (
                  <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.05] px-3 text-xs font-medium">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Owner
                  </span>
                ) : (
                  <RoleChip role={order === 1 ? "Can view" : "Can edit"} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-3 border-t border-white/[0.07] bg-black/15 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </span>
        <span>
          <span className="block text-[13px] font-medium">Private project</span>
          <span className="block text-xs text-muted-foreground">Only people with access can open this link.</span>
        </span>
      </div>
    </div>
  );
}

export function RolesDemo() {
  const [ref, t] = useDemoClock(9800);
  const open = t >= 850;
  const invited = t >= 3050;

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [950, "invite"],
        [3250, "people"],
        [8600, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [250, "share"],
        [1150, "email"],
        [2450, "invite"],
        [3500, null],
      ])}
      press={between(t, 700, 900) || between(t, 2900, 3100)}
    >
      <div className="ws-stage relative flex h-full flex-col">
        <WorkHeader mode="preview" live people={invited ? 3 : 2} pressed={between(t, 700, 900) ? "share" : null} />
        <div className="relative flex min-h-0 flex-1 gap-2 px-2 pb-2">
          <ChatWindow className="replica-wide w-[480px] shrink-0" footer={<Composer />}>
            <BuiltTurn />
          </ChatWindow>
          <PreviewWindow className="flex-1" state="live">
            <ClubApp t={9000} />
          </PreviewWindow>
          {open && <SharePanel email={invited ? "" : typed(INVITE, t, 1400, 70)} typing={between(t, 1300, 3050)} invited={invited} press={between(t, 2900, 3100)} />}
        </div>
      </div>
    </Demo>
  );
}

function ForkDialog({ forking, press }: { forking: boolean; press: boolean }) {
  return (
    <div className="chat-enter absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="app-menu app-menu-raised w-[430px] rounded-3xl border !p-6">
        <div data-shot="dialog-top">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-primary">
            <GitFork className="h-4 w-4" />
          </div>
          <p className="font-display text-[20px] font-semibold tracking-tight">Fork this project?</p>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">You&rsquo;ll get your own copy of every file and become its owner. The chat starts fresh, and changes in either project never affect the other.</p>
        </div>
        <div data-shot="dialog-foot" className="pt-4">
          <div className="app-field flex h-10 items-center justify-center rounded-full border text-sm">running-club (fork)</div>
          <div className="mt-4 flex justify-end gap-2">
            <span className="btn btn-glass inline-flex h-10 items-center rounded-full border px-5 text-sm font-semibold">Cancel</span>
            <span data-cur="confirm" data-press={press || undefined} className="btn btn-primary inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-semibold">
              {forking ? <OrbitSpinner className="h-3.5 w-3.5" /> : <GitFork className="h-3.5 w-3.5" />}
              {forking ? "Forking…" : "Fork project"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FreshChat() {
  return (
    <div className="chat-enter flex flex-col items-center gap-5 py-12 text-center">
      <span className="relative inline-flex h-12 w-12">
        <span className="empty-glow absolute -inset-[110%]" />
        <HorizonMark className="relative h-full w-full" />
      </span>
      <h3 className="dash-headline font-display text-[26px] font-semibold leading-tight tracking-tight">
        What should we <em className="heat-text pr-1 font-medium">build?</em>
      </h3>
    </div>
  );
}

export function ForkDemo() {
  const [ref, t] = useDemoClock(9500);
  const forked = t >= 3900;

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [350, "actions"],
        [1000, "dialog-top"],
        [2250, "dialog-foot"],
        [4050, "name"],
        [5700, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [250, "fork"],
        [2300, "confirm"],
        [4000, null],
      ])}
      press={between(t, 700, 900) || between(t, 2850, 3050)}
    >
      <div className="ws-stage relative flex h-full flex-col">
        <WorkHeader mode="code" name={forked ? "running-club (fork)" : "running-club"} people={forked ? 1 : 3} pressed={between(t, 700, 900) ? "fork" : null} />
        <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
          <ChatWindow className="min-w-0 flex-1" footer={<Composer />}>
            {forked ? <FreshChat /> : <BuiltTurn />}
          </ChatWindow>
          <FileTreeWindow className="w-[250px]" files={PROJECT} selected="src/pages/Dashboard.tsx" />
        </div>
        {between(t, 850, 3900) && <ForkDialog forking={t >= 3000} press={between(t, 2850, 3050)} />}
      </div>
    </Demo>
  );
}

export function DownloadDemo() {
  const [ref, t] = useDemoClock(8800);
  const saved = t >= 3300;

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [400, "tree-top"],
        [1650, "actions"],
        [3450, "zip"],
        [7600, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [1500, "download"],
        [3400, null],
      ])}
      press={between(t, 2100, 2320)}
    >
      <div className="ws-stage relative flex h-full flex-col">
        <WorkHeader mode="code" pressed={between(t, 2100, 2320) ? "download" : null} downloading={between(t, 2250, 3300)} />
        <div className="relative flex min-h-0 flex-1 gap-2 px-2 pb-2">
          <FileTreeWindow files={PROJECT} selected="src/lib/streaks.ts" />
          <EditorWindow className="flex-1" tabs={["src/lib/streaks.ts"]} active="src/lib/streaks.ts" lines={whole(STREAKS)} />
          {saved && (
            <div data-shot="zip" className="app-menu app-menu-raised chat-enter absolute right-2 top-1 z-30 flex w-[330px] items-center gap-3 rounded-2xl border !p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/[0.1] text-primary">
                <FileArchive className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">running-club.zip</span>
                <span className="block text-xs text-muted-foreground">{PROJECT.length} files · every line of it yours</span>
              </span>
              <Check className="h-4 w-4 shrink-0 text-syntax-string" />
            </div>
          )}
        </div>
      </div>
    </Demo>
  );
}

const RANGES = ["Today", "7 days", "30 days", "90 days"];
const KINDS = [
  { name: "Build", color: "hsl(40 100% 64%)" },
  { name: "ExplainLLM", color: "hsl(212 90% 70%)" },
  { name: "Idea interview", color: "hsl(152 55% 60%)" },
];
const WEEK = [
  [42, 10, 4],
  [68, 6, 0],
  [30, 14, 6],
  [85, 8, 0],
  [54, 18, 3],
  [22, 4, 0],
  [61, 12, 5],
];
const MONTH = [28, 44, 12, 60, 38, 72, 20, 50, 66, 34, 18, 80, 46, 58, 24, 70, 40, 62, 30, 54].map((build, day) => [build, (day * 7) % 16, day % 4 === 0 ? 5 : 0]);
const BY_PROJECT = [
  { name: "running-club", tokens: "2.4M", share: 0.86 },
  { name: "recipe-box", tokens: "1.1M", share: 0.42 },
  { name: "study-planner", tokens: "420k", share: 0.18 },
];

export function UsageDemo() {
  const [ref, t] = useDemoClock(10800);
  const month = t >= 2550;
  const series = month ? MONTH : WEEK;
  const grow = ease(span(t, month ? 2650 : 250, 900));
  const stats = [
    { label: "Used today", value: "760k", hint: "of 2M · resets in 7h", bar: 0.38 },
    { label: month ? "Last 30 days" : "Last 7 days", value: month ? "16.8M" : "4.1M", hint: `${month ? 412 : 96} requests` },
    { label: "Average per day", value: month ? "560k" : "586k", hint: month ? "peak 1.4M" : "peak 1.2M" },
  ];

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [400, "stats"],
        [1750, "range"],
        [3000, "chart"],
        [7250, "projects"],
        [9600, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [1700, "range-2"],
        [3200, null],
      ])}
      press={between(t, 2400, 2600)}
    >
      <div className="replica-sky h-full overflow-hidden">
        <div className="replica-scroll mx-auto max-w-[760px] space-y-3 px-5 pt-4" style={{ transform: `translate3d(0, ${t >= 6300 && t < 9600 ? -250 : 0}px, 0)` }}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <span data-align="left" className="app-eyebrow">
                Account
              </span>
              <h1 className="mt-1 font-display text-[26px] font-semibold leading-none tracking-tight">Usage</h1>
            </div>
            <div data-shot="range" className="app-track relative flex p-1">
              <span className="seg-pill absolute inset-y-1 left-1 w-[74px] transition-transform duration-[650ms] ease-[cubic-bezier(0.34,1.35,0.64,1)]" style={{ transform: `translateX(${(month ? 2 : 1) * 74}px)` }} />
              {RANGES.map((range, order) => (
                <span key={range} data-cur={`range-${order}`} className={cn("relative z-10 flex h-7 w-[74px] items-center justify-center text-xs font-medium transition-colors", order === (month ? 2 : 1) ? "text-foreground" : "text-muted-foreground")}>
                  {range}
                </span>
              ))}
            </div>
          </div>
          <div data-shot="stats" className="grid grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="app-card rounded-2xl p-4">
                <p className="app-label">{stat.label}</p>
                <p key={stat.value} className="chat-enter mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight">
                  {stat.value}
                </p>
                {stat.bar !== undefined && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className="app-progress-fill !relative h-full rounded-full" style={{ width: `${stat.bar * 100}%` }} />
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">{stat.hint}</p>
              </div>
            ))}
          </div>
          <section data-shot="chart" className="app-glass rounded-[22px] p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">Tokens by day</h2>
              <div className="flex gap-3">
                {KINDS.map((kind) => (
                  <span key={kind.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: kind.color }} />
                    {kind.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 flex h-[120px] items-end gap-1.5">
              {series.map((day, order) => (
                <span key={`${month}-${order}`} className="flex h-full flex-1 flex-col-reverse gap-px">
                  {day.map((value, kind) => (
                    <span key={kind} className={cn(kind === 2 && "rounded-t-[3px]")} style={{ height: `${value * ease(span(grow, order / (series.length * 1.6), 0.6))}%`, background: KINDS[kind].color, opacity: kind === 0 ? 0.92 : 0.85 }} />
                  ))}
                </span>
              ))}
            </div>
          </section>
          <section data-shot="projects" className="app-glass rounded-[22px] p-5">
            <h2 className="text-sm font-semibold">By project</h2>
            <div className="mt-3 space-y-3">
              {BY_PROJECT.map((project, order) => (
                <div key={project.name}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 font-medium text-foreground/90">
                      <Swatch name={project.name} className="h-3.5 w-3.5" />
                      {project.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{project.tokens}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(30_100%_56%),hsl(44_100%_68%))]" style={{ width: `${project.share * 100 * ease(span(t, 7200 + order * 180, 900))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Demo>
  );
}

const CODE = "482913";
const ACTIVITY = [
  { text: "Signed in", detail: "Chrome on Windows", when: "2 hours ago" },
  { text: "Signed in", detail: "Safari on iPhone", when: "yesterday" },
];

function ActivityRow({ text, detail, when, fresh = false }: { text: string; detail: string; when: string; fresh?: boolean }) {
  return (
    <li className={cn(fresh && "replica-grow")}>
      <div className="flex min-h-0 items-center gap-3 py-2 text-[13px]">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", fresh ? "bg-primary" : "bg-muted-foreground/50")} />
        <span className="font-medium">{text}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{detail}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
      </div>
    </li>
  );
}

export function SecurityDemo() {
  const [ref, t] = useDemoClock(11500);
  const setup = t >= 900;
  const digits = Math.min(CODE.length, Math.max(0, Math.floor((t - 1400) / 230)));
  const on = t >= 3300;
  const gone = t >= 7300;

  return (
    <Demo
      stage={ref}
      shot={at<string | null>(t, [
        [0, null],
        [350, "protect"],
        [5250, "sessions"],
        [6150, "confirm"],
        [7500, "activity"],
        [10300, null],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [300, "setup"],
        [1200, "code"],
        [2800, "setup"],
        [3700, null],
        [5300, "signout"],
        [6600, "agree"],
        [7700, null],
      ])}
      press={between(t, 750, 950) || between(t, 3150, 3350) || between(t, 5900, 6100) || between(t, 7150, 7350)}
    >
      <div className="replica-sky relative h-full overflow-hidden">
        <div className="replica-scroll mx-auto max-w-[620px] space-y-3 px-5 pt-4" style={{ transform: `translate3d(0, ${t >= 4300 && t < 10300 ? -150 : 0}px, 0)` }}>
          <section data-shot="protect" className="app-glass rounded-[22px] p-5">
            <p className="app-label">Sign-in protection</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Two-step verification
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">With two-step verification, a stolen password alone isn&rsquo;t enough to get into your account.</p>
            <div className="mt-4 border-t border-border/50 pt-4">
              <p className="text-sm font-medium">Authenticator app</p>
              {on ? (
                <div className="chat-enter app-field mt-2 flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
                  <Smartphone className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span>Authenticator app</span>
                  <span className="text-xs text-muted-foreground">added just now</span>
                  <span className="ml-auto flex items-center gap-1 text-xs font-medium text-syntax-string">
                    <Check className="h-3.5 w-3.5" />
                    On
                  </span>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-3">
                  {setup ? (
                    <div data-cur="code" className="chat-enter flex gap-1.5">
                      {CODE.split("").map((digit, order) => (
                        <span key={order} className={cn("app-field flex h-9 w-8 items-center justify-center rounded-lg border font-mono text-sm tabular-nums", order === digits && "!border-primary/60")}>
                          {order < digits ? digit : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Off - your account signs in with one factor.</p>
                  )}
                  <span data-cur="setup" data-press={between(t, 750, 950) || between(t, 3150, 3350) || undefined} className="btn btn-primary inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-semibold">
                    {setup ? "Turn on" : "Set up"}
                  </span>
                </div>
              )}
            </div>
          </section>
          <section data-shot="sessions" className="app-glass rounded-[22px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="app-label">Sessions</p>
                <h2 className="mt-1 text-lg font-semibold">Sign out everywhere</h2>
                <p className="mt-1 text-xs text-muted-foreground">Ends every session on every device, this one included.</p>
              </div>
              <span data-cur="signout" data-press={between(t, 5900, 6100) || undefined} className="btn btn-glass inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold">
                <LogOut className="h-3.5 w-3.5 text-red-500" />
                Sign out everywhere
              </span>
            </div>
          </section>
          <section data-shot="activity" className="app-glass rounded-[22px] p-5">
            <p className="app-label">Recent activity</p>
            <ul className="mt-2 divide-y divide-white/[0.06]">
              {gone && <ActivityRow fresh text="Signed out everywhere" detail="2 other devices" when="just now" />}
              {on && <ActivityRow fresh text="Two-step verification on" detail="authenticator app" when="just now" />}
              {ACTIVITY.map((entry) => (
                <ActivityRow key={entry.detail} {...entry} />
              ))}
            </ul>
          </section>
        </div>
        {between(t, 6050, 7300) && (
          <div className="chat-enter absolute inset-0 z-30 flex items-center justify-center bg-black/60">
            <div data-shot="confirm" className="app-menu app-menu-raised w-[400px] rounded-3xl border !p-6">
              <p className="font-display text-[20px] font-semibold tracking-tight">Sign out of every device?</p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">You&rsquo;ll need to sign in again here too.</p>
              <div className="mt-5 flex justify-end gap-2">
                <span className="btn btn-glass inline-flex h-10 items-center rounded-full border px-5 text-sm font-semibold">Cancel</span>
                <span data-cur="agree" data-press={between(t, 7150, 7350) || undefined} className="btn btn-primary inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold">
                  Sign out everywhere
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Demo>
  );
}
