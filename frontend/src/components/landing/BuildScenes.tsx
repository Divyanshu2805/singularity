/**
 * The seven screens of the build orbit's centre: one project going from a sentence to a running app and on into
 * everyday use, each filmed on the app's own screen and driven by the time since it started.
 *
 * Handles: describe (the dashboard, where the idea is typed into the prompt and sent), interview (the idea
 * interview's card - a question, its numbered answers, the step bar filling, then the review and "Build it"), build
 * (the workspace: the brief in the chat, the build steps ticking, and in the code view the files landing in the tree
 * while each one streams into the editor), preview (the pointer switching to Preview, the pod's start-up steps, then
 * the running app counting its streak up), change (a follow-up typed into the prompt, the files read, the plan and
 * the edited files), the updated preview (a reload that brings the new weekly chart in, the page scrolling down to
 * it), and ExplainLLM (a line of the generated code selected, the panel opened, a question asked and the answer
 * streaming in after the file is read). Each scene reads only its elapsed time, so the orbit that hosts them can
 * restart, pause or pin one to a still frame without the scene knowing, and scrolling back rewinds it.
 *
 * Every scene is AppReplica's pieces - the real dashboard, interview card, workspace, editor and preview window in
 * the app's own classes - on a screen laid out at the app's size (CANVAS wide) and filmed by its camera: a scene
 * says which part to show at each moment (a data-shot name, or nothing for the whole screen) and where the pointer
 * is, and the camera decides how close to go (AppReplica's Screen): on a desktop the window is large enough that it
 * shows the whole screen and goes in only for a click on a small control; on a phone, where the whole would be too
 * small to read, it goes in on the part named. The scenes used to be spent close in at any size, which cut the code
 * and the cards they were showing.
 *
 * The copy mirrors the real product: the interview asks the same four kinds of question the idea clarifier does, the
 * first message of the build is the brief that interview compiles, the preview checklist is the server's own
 * start-up steps from lib/preview, and ExplainLLM answers about a line of the project's own code after reading the
 * file, so the demo cannot drift into promising a flow the app doesn't have.
 */
import type { ReactNode } from "react";
import {
  Bubble,
  Clarifier,
  ClubApp,
  Composer,
  DashHeadline,
  DashPrompt,
  Dashboard,
  EditorWindow,
  EditsTile,
  FileTreeWindow,
  Grow,
  IdeaChips,
  LensWindow,
  PreviewWindow,
  Prose,
  ReadRow,
  Screen,
  StepsTile,
  TurnHead,
  UsageLine,
  Working,
  Workspace,
  type Question,
  type StepState,
} from "./AppReplica";
import { at, between, streamed, typed, whole } from "./replica";

const CANVAS = 1060;
const fit = (width: number) => width / CANVAS;

function Film({ shot, cursor, press, children }: { shot: string | null; cursor: string | null; press: boolean; children: ReactNode }) {
  return (
    <Screen base={fit} pad={10} glide={950} shot={shot} cursor={cursor} press={press} className="h-full">
      {children}
    </Screen>
  );
}

const IDEA = "A habit tracker for my running club, with streaks and a leaderboard";

const QUESTIONS: Question[] = [
  { ask: "Who is this for?", helper: "Knowing your users shapes every screen.", options: ["Just me", "My running club", "Coaches", "The general public"] },
  { ask: "What's the one thing runners must be able to do?", helper: "Everything else gets built around this.", options: ["Log a run", "Plan races", "Chat with the club", "Share a route"] },
  { ask: "Which screens does it need?", helper: "Pick any that apply. You can always add more later.", options: ["Dashboard", "Streak calendar", "Leaderboard", "Settings", "Sign in"], multi: true },
  { ask: "What should it feel like?", helper: "A style reference helps the design land the first time.", options: ["Warm and minimal", "Bold and colorful", "Dark and techy", "Playful and friendly"] },
];
const ANSWERS = ["My running club", "Log a run", "Dashboard, Streak calendar, Leaderboard", "Warm and minimal"];

function ShapeHeadline() {
  return <DashHeadline eyebrow="A few quick questions" lead="Let’s shape your" accent="idea" />;
}

function DescribeStage({ t }: { t: number }) {
  const sent = t >= 3900;

  return (
    <Film
      shot={at<string | null>(t, [
        [0, null],
        [350, "prompt"],
        [4100, "clarifier"],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [250, "prompt"],
        [3150, "send"],
        [4150, null],
      ])}
      press={between(t, 3700, 3920)}
    >
      <Dashboard>
        {sent ? <ShapeHeadline /> : <DashHeadline />}
        <div className="mt-8 w-full">
          {sent ? (
            <Clarifier idea={IDEA} questions={QUESTIONS} index={0} picked={[]} phase="loading" />
          ) : (
            <DashPrompt text={typed(IDEA, t, 700, 34)} focus={t >= 500} press={between(t, 3700, 3920)} />
          )}
        </div>
        {!sent && <IdeaChips />}
      </Dashboard>
    </Film>
  );
}

const ASK = [
  { from: 0, picks: [{ option: 1, at: 1400 }] },
  { from: 1900, picks: [{ option: 0, at: 2900 }] },
  {
    from: 3400,
    picks: [
      { option: 0, at: 3950 },
      { option: 1, at: 4350 },
      { option: 2, at: 4750 },
    ],
  },
  { from: 5300, picks: [{ option: 0, at: 5950 }] },
];
const REVIEW = 6300;

function InterviewStage({ t }: { t: number }) {
  const index = ASK.reduce((current, item, order) => (t >= item.from ? order : current), 0);
  const reviewing = t >= REVIEW;

  return (
    <Film
      shot="clarifier"
      cursor={at<string | null>(t, [
        [0, null],
        [450, "option-1"],
        [1900, null],
        [2100, "option-0"],
        [3400, null],
        [3600, "option-0"],
        [4050, "option-1"],
        [4450, "option-2"],
        [4850, "send"],
        [5300, null],
        [5450, "option-0"],
        [6300, null],
        [6500, "send"],
      ])}
      press={between(t, 1300, 1500) || between(t, 2800, 3000) || between(t, 3850, 4000) || between(t, 4250, 4400) || between(t, 4650, 4800) || between(t, 5100, 5300) || between(t, 5850, 6050) || between(t, 6950, 7150)}
    >
      <Dashboard>
        <ShapeHeadline />
        <div className="mt-8 w-full">
          <Clarifier
            idea={IDEA}
            questions={QUESTIONS}
            index={index}
            picked={ASK[index].picks.filter((pick) => t >= pick.at).map((pick) => pick.option)}
            phase={t >= 7100 ? "compiling" : reviewing ? "review" : "asking"}
            answers={ANSWERS}
            press={between(t, 5100, 5300) || between(t, 6950, 7150)}
          />
        </div>
      </Dashboard>
    </Film>
  );
}

function Brief() {
  return (
    <Bubble>
      <p>
        <strong className="font-semibold">Build:</strong> {IDEA}
      </p>
      <p className="mt-2 font-semibold">Details:</p>
      <ul className="list-disc pl-5">
        <li>Who is this for: My running club</li>
        <li>Screens: Dashboard, Streak calendar, Leaderboard</li>
        <li>Feel: Warm and minimal</li>
      </ul>
    </Bubble>
  );
}

const BUILD = [
  { label: "Set up the project", path: "package.json", from: 1200, code: ["{", '  "name": "running-club",', '  "private": true,', '  "scripts": { "dev": "vite" }', "}"] },
  {
    label: "Count streaks from logged runs",
    path: "src/lib/streaks.ts",
    from: 1900,
    code: [
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
      "",
      'export const BADGE = "on fire";',
    ],
  },
  {
    label: "Draw the streak calendar",
    path: "src/components/StreakCalendar.tsx",
    from: 4000,
    code: [
      "export function StreakCalendar({ runs }: Props) {",
      "  const days = lastFourWeeks();",
      "  return (",
      '    <div className="grid grid-cols-7 gap-1">',
      "      {days.map((day) => (",
      "        <Day key={day} ran={ranOn(runs, day)} />",
      "      ))}",
      "    </div>",
      "  );",
      "}",
    ],
  },
  {
    label: "Rank the club on a leaderboard",
    path: "src/components/Leaderboard.tsx",
    from: 4800,
    code: [
      "export function Leaderboard({ club }: Props) {",
      "  const top = byStreak(club);",
      "  return (",
      "    <ol>",
      "      {top.map((runner) => (",
      "        <Row key={runner.id} runner={runner} />",
      "      ))}",
      "    </ol>",
      "  );",
      "}",
    ],
  },
  {
    label: "Put it together on the dashboard",
    path: "src/pages/Dashboard.tsx",
    from: 5600,
    code: [
      'import { currentStreak } from "../lib/streaks";',
      "",
      "export function Dashboard() {",
      "  const streak = currentStreak(runs);",
      "  return (",
      "    <main>",
      "      <StreakBadge days={streak} />",
      "      <StreakCalendar runs={runs} />",
      "      <Leaderboard club={club} />",
      "    </main>",
      "  );",
      "}",
    ],
  },
];
const BUILT = 6400;
const STARTER = ["index.html", "src/App.tsx"];
const PROJECT = [...STARTER, ...BUILD.map((file) => file.path)];
const BUILD_STEPS = BUILD.map(({ label, path }) => ({ label, path, state: "done" as StepState }));
const STREAKS = BUILD[1].code;
const DASHBOARD = BUILD[4].code;

function BuildStage({ t }: { t: number }) {
  const active = BUILD.reduce((current, file, order) => (t >= file.from ? order : current), 0);
  const file = BUILD[active];
  const until = active + 1 < BUILD.length ? BUILD[active + 1].from : BUILT;
  const lines = streamed(file.code, (t - file.from) / (until - file.from - 200));
  const started = BUILD.filter((item) => t >= item.from).map((item) => item.path);
  const stateOf = (order: number): StepState => (order < active || t >= BUILT ? "done" : order === active && t >= BUILD[0].from ? "active" : "pending");

  return (
    <Film
      shot={at<string | null>(t, [
        [0, null],
        [450, "chat-foot"],
        [1500, "right-top"],
        [5900, "steps"],
        [6700, null],
      ])}
      cursor={null}
      press={false}
    >
      <Workspace
        mode="code"
        busy
        chat={
          <>
            <div className="pt-5">
              <Brief />
            </div>
            {t >= 250 && (
              <Grow>
                <TurnHead thought={t >= BUILT ? "Worked for 48s" : undefined} />
              </Grow>
            )}
            {between(t, 250, 700) && (
              <Grow gap={false} className="pt-3">
                <Working />
              </Grow>
            )}
            {t >= 700 && (
              <Grow gap={false} className="pt-3">
                <StepsTile steps={BUILD.map(({ label, path }, order) => ({ label, path, state: stateOf(order) }))} />
              </Grow>
            )}
            {t >= BUILD[0].from && (
              <Grow gap={false} className="pt-3">
                <EditsTile files={BUILD.filter((item) => t >= item.from).map((item, order) => ({ path: item.path, active: stateOf(order) !== "done" }))} />
              </Grow>
            )}
          </>
        }
        footer={
          <>
            <UsageLine percent={t >= BUILT ? 31 : 22} used={t >= BUILT ? "620k" : "440k"} streaming={t < BUILT} />
            <Composer working={t < BUILT} />
          </>
        }
      >
        <FileTreeWindow className="w-[200px]" files={[...STARTER, ...started]} selected={t >= BUILD[0].from ? file.path : undefined} changed={started} writing={between(t, BUILD[0].from, BUILT) ? file.path : undefined} />
        <EditorWindow
          className="flex-1"
          tabs={started.slice(-2)}
          active={file.path}
          lines={t >= BUILD[0].from ? lines : []}
          caret={between(t, BUILD[0].from, BUILT)}
          current={lines.length - 1}
          top={Math.max(0, lines.length - 9)}
          dots={started}
        />
      </Workspace>
    </Film>
  );
}

function BuiltTurn() {
  return (
    <>
      <TurnHead thought="Worked for 48s" />
      <div className="pt-3">
        <StepsTile steps={BUILD_STEPS} />
      </div>
      <Prose className="pt-3">
        Your running club tracker is ready. Open the <strong className="font-semibold">Preview</strong> to try it, or ask for a change.
      </Prose>
    </>
  );
}

const BOOT = 650;
const BOOT_EACH = 650;
const RUNNING = BOOT + BOOT_EACH * 4;

function PreviewStage({ t }: { t: number }) {
  const previewing = t >= BOOT;
  const live = t >= RUNNING;

  return (
    <Film
      shot={at<string | null>(t, [
        [0, null],
        [850, "boot"],
        [RUNNING, "preview"],
        [RUNNING + 1000, "streak"],
        [5500, null],
      ])}
      cursor={at<string | null>(t, [
        [0, "tab-code"],
        [80, "tab-preview"],
        [1100, null],
      ])}
      press={between(t, 500, 720)}
    >
      <Workspace
        mode={previewing ? "preview" : "code"}
        live={live}
        chat={
          <div className="pt-5">
            <BuiltTurn />
          </div>
        }
        footer={
          <>
            <UsageLine percent={31} used="620k" />
            <Composer />
          </>
        }
      >
        {previewing ? (
          <PreviewWindow className="flex-1" state={live ? "live" : "starting"} step={Math.min(3, Math.floor((t - BOOT) / BOOT_EACH))} seconds={Math.round((t - BOOT) / 210)}>
            <ClubApp t={t - RUNNING} />
          </PreviewWindow>
        ) : (
          <>
            <FileTreeWindow className="w-[200px]" files={PROJECT} selected="src/pages/Dashboard.tsx" />
            <EditorWindow className="flex-1" tabs={["src/pages/Dashboard.tsx"]} active="src/pages/Dashboard.tsx" lines={whole(DASHBOARD)} />
          </>
        )}
      </Workspace>
    </Film>
  );
}

const CHANGE = "Add a weekly distance chart under the streak";
const CHANGE_STEPS = [
  { label: "Sum distance per day", path: "src/components/WeeklyChart.tsx", from: 3900, until: 4700 },
  { label: "Show the chart on the dashboard", path: "src/pages/Dashboard.tsx", from: 4700, until: 5500 },
];
const CHANGE_REPLY = "Added a seven-day distance chart right under your streak.";
const CHANGE_SENT = 2400;

function ChangeTurn({ t }: { t: number }) {
  const stateOf = (step: (typeof CHANGE_STEPS)[number]): StepState => (t >= step.until ? "done" : t >= step.from ? "active" : "pending");
  if (t < CHANGE_SENT) return null;

  return (
    <>
      <Grow>
        <Bubble>{CHANGE}</Bubble>
      </Grow>
      {t >= 2700 && (
        <Grow>
          <TurnHead thought={t >= 5500 ? "Worked for 21s" : undefined} />
        </Grow>
      )}
      {between(t, 2700, 3200) && (
        <Grow gap={false} className="pt-3">
          <Working />
        </Grow>
      )}
      {t >= 3200 && (
        <Grow gap={false} className="pt-3">
          <ReadRow files={["src/pages/Dashboard.tsx", "src/lib/streaks.ts"]} active={t < 3700} />
        </Grow>
      )}
      {t >= 3700 && (
        <Grow gap={false} className="pt-3">
          <StepsTile steps={CHANGE_STEPS.map((step) => ({ label: step.label, path: step.path, state: stateOf(step) }))} />
        </Grow>
      )}
      {t >= CHANGE_STEPS[0].from && (
        <Grow gap={false} className="pt-3">
          <EditsTile files={CHANGE_STEPS.filter((step) => t >= step.from).map((step) => ({ path: step.path, active: stateOf(step) !== "done" }))} />
        </Grow>
      )}
      {t >= 5600 && (
        <Grow gap={false} className="pt-3">
          <Prose>{typed(CHANGE_REPLY, t, 5600, 20)}</Prose>
        </Grow>
      )}
    </>
  );
}

function ChangeStage({ t }: { t: number }) {
  const working = t >= CHANGE_SENT && t < 5600;

  return (
    <Film
      shot={at<string | null>(t, [
        [0, null],
        [300, "composer"],
        [2550, "chat-foot"],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [250, "prompt"],
        [1950, "send"],
        [2700, null],
      ])}
      press={between(t, 2250, 2450)}
    >
      <Workspace
        mode="preview"
        live
        busy={working}
        chat={
          <>
            <div className="pt-5">
              <BuiltTurn />
            </div>
            <ChangeTurn t={t} />
          </>
        }
        footer={
          <>
            <UsageLine percent={t >= 5600 ? 38 : 31} used={t >= 5600 ? "760k" : "620k"} streaming={working} />
            <Composer text={t < CHANGE_SENT ? typed(CHANGE, t, 500, 30) : ""} focus={between(t, 350, CHANGE_SENT)} working={working} press={between(t, 2250, 2450)} />
          </>
        }
      >
        <PreviewWindow className="flex-1" state="live">
          <ClubApp t={9000} />
        </PreviewWindow>
      </Workspace>
    </Film>
  );
}

const RELOADED = 900;

function UpdatedPreviewStage({ t }: { t: number }) {
  const live = t >= RELOADED;

  return (
    <Film
      shot={at<string | null>(t, [
        [0, "preview"],
        [RELOADED + 700, "chart"],
        [3700, "board"],
        [4500, null],
      ])}
      cursor={null}
      press={false}
    >
      <Workspace
        mode="preview"
        live={live}
        chat={
          <>
            <div className="pt-5">
              <BuiltTurn />
            </div>
            <ChangeTurn t={60000} />
          </>
        }
        footer={
          <>
            <UsageLine percent={38} used="760k" />
            <Composer />
          </>
        }
      >
        <PreviewWindow className="flex-1" state="live" reloading={!live}>
          <ClubApp t={live ? t - RELOADED : 9000} chart={live} scroll={t >= 2700 ? 150 : 0} />
        </PreviewWindow>
      </Workspace>
    </Film>
  );
}

const ASKED = "Why is this a Set?";
const EXPLANATION = "A Set keeps each day once and answers “did they run that day?” in one step, so counting back from today is a quick check per day - not a search through every run.";
const PICKED = 2;

function ExplainStage({ t }: { t: number }) {
  const open = t >= 1600;
  const asked = t >= 3200;
  const answering = t >= 4300;
  const answer = typed(EXPLANATION, t, 4300, 18);

  return (
    <Film
      shot={at<string | null>(t, [
        [0, "code"],
        [950, "pick"],
        [1900, "ask"],
        [3300, "answer-zone"],
      ])}
      cursor={at<string | null>(t, [
        [0, null],
        [150, `line-${PICKED + 1}`],
        [1050, "lens"],
        [1750, "ask"],
        [2850, "lens-send"],
        [3400, null],
      ])}
      press={between(t, 700, 900) || between(t, 1450, 1650) || between(t, 3050, 3250)}
    >
      <Workspace
        mode="code"
        live
        split="26%"
        chat={
          <div className="pt-5">
            <BuiltTurn />
          </div>
        }
        footer={<Composer />}
      >
        <EditorWindow
          className="flex-1"
          tabs={["src/lib/streaks.ts"]}
          active="src/lib/streaks.ts"
          lines={STREAKS.map((text, order) => ({ text, tone: order === PICKED && t >= 800 ? "pick" : undefined }))}
          lens={open}
        />
        {open && (
          <LensWindow
            selection={{ file: "streaks.ts", lines: "L3" }}
            asking={asked ? "" : typed(ASKED, t, 2100, 40)}
            question={asked ? ASKED : undefined}
            reading={asked && t < 4100}
            read={t >= 4100 ? "src/lib/streaks.ts" : undefined}
            answer={answering ? answer : undefined}
            done={answer.length >= EXPLANATION.length}
            press={between(t, 3050, 3250)}
          />
        )}
      </Workspace>
    </Film>
  );
}

const SCENES = [DescribeStage, InterviewStage, BuildStage, PreviewStage, ChangeStage, UpdatedPreviewStage, ExplainStage];

export function BuildScene({ index, t }: { index: number; t: number }) {
  const Scene = SCENES[index];
  return <Scene t={t} />;
}
