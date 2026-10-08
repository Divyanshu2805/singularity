/**
 * Renders an assistant turn: its thought process, the build as one card of steps with the files each wrote, the
 * lesson on what each step changed in a turn built in teaching mode, any question it put to the user, and the prose
 * in between.
 *
 * Handles: grouping the raw events into blocks, folding the model's working-out away once it has finished arriving,
 * resolving each build step's status as the turn progresses, putting every file under the step that wrote it,
 * putting a lesson icon beside each finished step of a turn built in teaching mode, opening a file from its chip,
 * handing a step saved with an older lesson to the code lens for a detailed explanation, showing a turn's questions with their suggested answers (one question is
 * answered with a click; several are picked and then sent together), and the separate rendering for a turn that ended
 * in an error.
 *
 * A turn is shown in the order things happen, the way a terminal agent shows its work. While it is being written,
 * each file is one line as it arrives - what the step is for, the file, and where it stands in the plan ("3/12") -
 * between the sentences the model says as it goes; the plan itself is not drawn. Once the turn is saved, those
 * lines fold to one each ("4 files written"), still between the sentences they were written between and opening
 * when pressed to the files alone - their names, not each one's step again, which the build card below already
 * says (the step beside each file was taken out of the opened fold at the owner's request), and the build
 * card is placed last, under the closing words: the whole build as steps, which is where
 * a step's lesson is opened in teaching mode. The card used to appear as "Plan" before a line was written and
 * count up in place, which put a long checklist between the person and what was actually happening.
 *
 * There is one card for a build where there used to be two. A turn showed a "Build steps" checklist and, under it, an
 * "Edited 8 files" list naming the same eight files again, and the model's plan sat above both as a numbered Markdown
 * list - three tellings of one thing. The checklist is now the plan: it appears as "Plan" before anything is written,
 * counts up as "Building" while files land beside their steps, and settles as "Built". A file nobody listed - one a
 * step wrote alongside its main file, or one added by a later pass that repaired an import - is shown too, under the
 * step that was being written or as a row of its own, so the card is still the whole record of what changed.
 *
 * Teaching mode writes nothing during the build, and belongs to the turn it was switched on for: the caller passes
 * `teaching` per turn, so only that turn's steps carry a lesson. A finished step of such a turn has a graduation-cap
 * button right beside its name (beside each file's chip when a step wrote several). Pressing it opens the lesson under
 * the step - the one the server already keeps for that step, or a new one fetched through lib/lesson-store.ts and
 * shown as it streams in: an opening that starts from what was asked, then one section per piece of what the step
 * changed with the lines it covers shown beside it and opening the editor at that range, the terms to remember
 * marked, and a closing line on what comes next. Nothing opens by itself, and nothing is requested until the button
 * is pressed. The button is offered once the saved turn has arrived, since a lesson is asked for by the id of the
 * saved file edit. Lessons saved by earlier versions sit folded under their step as "What this step does", with the
 * detail button and, for the oldest shape, the quoted lines behind a "Line by line" toggle.
 *
 * The lesson used to be a row of its own under every step, reading "How File.tsx works", shown on every turn in the
 * conversation whenever the mode was on, and it explained the whole file. The owner asked for the icon beside the
 * step, for lessons only on the turns that were asked for with the mode on, and for the lesson to be about what
 * that turn changed.
 *
 * A question can only be answered on the newest turn while nothing is streaming; on an older turn its suggestions are
 * shown as plain text, since the conversation has already moved past them.
 *
 * The step list has a hard cap matching the parser's, so the live view shows exactly what gets saved. Its real length
 * is set by the work - the model is told to emit one step per file - so the cap only bites when it ignores that.
 *
 * The thought process is a single line while the model works - each of its steps takes the line in turn, at a pace a
 * person can read (hooks/use-step-reveal.ts), never typed out - and stays folded afterwards as "Thought process"
 * with its step count; it is opened only by the person, and shows its steps numbered.
 *
 * While a turn is in progress and nothing is arriving, the line at the foot says what the server reports it is doing
 * - reading files, carrying on a reply that stopped early, checking imports, saving - and falls back to "Thinking" or
 * "Working" when the server has said nothing. The head of the turn counts how long it has been working, and becomes
 * the saved "Worked for" line once the turn is done.
 *
 * The blocks are cards a step lighter than the chat window with a lighter head (index.css, .chat-tile), their rows
 * and toggles take the app's row highlight (.hl-row) under the pointer, anything under way shows the app's comet
 * (OrbitSpinner) rather than a spinning icon, and the turn is signed with the horizon mark (HorizonMark).
 */
import { Fragment, type CSSProperties, type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleAlert, CircleHelp, Clock, FilePen, FileSearch, GraduationCap, Lightbulb, ListChecks, MessagesSquare, Trash2 } from 'lucide-react';
import { HorizonMark } from '@/components/HorizonMark';
import { OrbitSpinner } from '@/components/app/OrbitSpinner';
import { ChatMarkdown } from '@/components/ChatMarkdown';
import { useStepReveal } from '@/hooks/use-step-reveal';
import { ChatEvent, ChatEventType } from '@/lib/types';
import { type AskedQuestion, formatAnswers, isFullyAnswered, parseAnswerOptions } from '@/lib/ask';
import { getFileColor, getFileIcon, splitPath } from '@/lib/file-icons';
import { type CodeTarget, type Lesson, type LessonPart, linesOf, parseLesson, parseWalkthrough, withLines } from '@/lib/lesson';
import { type LessonState, lessonKey, requestLesson, useLesson } from '@/lib/lesson-store';
import { thoughtSteps } from '@/lib/thought';
import { cn, formatWorkedFor } from '@/lib/utils';

type OpenFile = (path: string, target?: CodeTarget) => void;

export interface StepToExplain {
  path: string;
  label: string;
  what: string;
}

type ExplainStep = (step: StepToExplain) => void;

const MAX_CHECKLIST_STEPS = 12;

type LessonView = Lesson & { isComplete: boolean };
type LessonItem = { path?: string; lesson: LessonView };
type StepFile = { path: string; active: boolean; deleted?: boolean; edited?: boolean; lines?: number; content?: string; eventId?: number; lesson?: string };
type StepStatus = 'done' | 'active' | 'pending';
type BuildStep = { label: string; path?: string; isExtra?: boolean; status: StepStatus; files: StepFile[]; lessons: LessonItem[] };
type AskItem = AskedQuestion & { isComplete: boolean };

type BuildBlock = { kind: 'build'; key: string; isPlanned: boolean; isRunning: boolean; hasStarted: boolean; steps: BuildStep[] };

type ActivityItem = { key: string; label?: string; position?: number; total?: number; file: StepFile };
type ActivityBlock = { kind: 'activity'; key: string; items: ActivityItem[]; isSummary?: boolean };

type Block =
  | ActivityBlock
  | { kind: 'thinking'; key: string; content: string; active: boolean }
  | { kind: 'message'; key: string; content: string }
  | { kind: 'reads'; key: string; files: string[]; active: boolean }
  | BuildBlock
  | { kind: 'lessons'; key: string; items: LessonItem[] }
  | { kind: 'ask'; key: string; questions: AskItem[] };

function tidyPartialMarkdown(text: string) {
  let tidy = text;
  if ((tidy.match(/\*\*/g)?.length ?? 0) % 2 === 1) tidy = tidy.replace(/\*\*(?!.*\*\*)/s, "");
  if (!tidy.includes("```") && (tidy.match(/`/g)?.length ?? 0) % 2 === 1) tidy = tidy.replace(/`(?!.*`)/s, "");
  return tidy;
}

const lineCount = (content: string) => (content ? content.replace(/\n$/, "").split("\n").length : 0);

const isFileEvent = (event: ChatEvent) =>
  event.type === ChatEventType.FILE_EDIT || event.type === ChatEventType.FILE_PATCH || event.type === ChatEventType.FILE_DELETE;

function resolveSteps(steps: BuildStep[], writtenPaths: Set<string>, isStreaming: boolean) {
  const done = steps.map((step) => !!step.path && writtenPaths.has(step.path));
  for (let i = steps.length - 2; i >= 0; i--) {
    if (done[i + 1] && !steps[i + 1].isExtra && !steps[i].isExtra) done[i] = true;
  }
  if (!isStreaming) {
    steps.forEach((step, i) => { if (!step.path) done[i] = true; });
  }
  const activeIndex = isStreaming ? done.indexOf(false) : -1;
  steps.forEach((step, i) => {
    step.status = done[i] ? 'done' : i === activeIndex ? 'active' : 'pending';
  });
}

export function buildBlocks(events: ChatEvent[], isStreaming: boolean): Block[] {
  const blocks: Block[] = [];
  const lastIndex = events.length - 1;
  const lessonPaths = new Set<string>();

  const writtenPaths = new Set(
    events
      .filter((event) => isFileEvent(event) && event.filePath && event.isComplete !== false)
      .map((event) => event.filePath as string)
  );
  const fileContents = new Map(
    events
      .filter((event) => event.type === ChatEventType.FILE_EDIT && event.filePath)
      .map((event) => [event.filePath as string, event.content])
  );

  const seenPaths = new Set<string>();
  let build: BuildBlock | undefined;
  let current: BuildStep | undefined;
  let openLessons: Extract<Block, { kind: 'lessons' }> | undefined;
  let lastWrittenPath: string | undefined;

  const openBuild = (index: number, isPlanned: boolean) => {
    build = { kind: 'build', key: `b${index}`, isPlanned, isRunning: false, hasStarted: false, steps: [] };
    current = undefined;
    blocks.push(build);
    return build;
  };

  const hasPlannedStepsLeft = (block: BuildBlock) =>
    block.steps.some((step) => !step.isExtra && !!step.path && !seenPaths.has(step.path));

  const stepFor = (block: BuildBlock, path: string) => {
    const named = block.steps.find((step) => step.path === path);
    if (named) return named;
    const holding = block.steps.find((step) => step.files.some((file) => file.path === path));
    if (holding) return holding;
    if (block.isPlanned && current && hasPlannedStepsLeft(block)) return current;
    const extra: BuildStep = { label: splitPath(path).base, path, isExtra: true, status: 'pending', files: [], lessons: [] };
    block.steps.push(extra);
    return extra;
  };

  events.forEach((event, index) => {
    const prev = blocks[blocks.length - 1];
    const belongsToBuild = isFileEvent(event) || event.type === ChatEventType.LEARN || event.type === ChatEventType.TODO;
    if (!belongsToBuild) {
      openLessons = undefined;
      if (build && !build.isPlanned) {
        build = undefined;
        current = undefined;
      }
    }

    if (event.type === ChatEventType.TODO && event.content) {
      const step: BuildStep = { label: event.content, path: event.filePath, status: 'pending', files: [], lessons: [] };
      const plan = build && build.isPlanned && prev === build ? build : openBuild(index, true);
      if (plan.steps.filter((one) => !one.isExtra).length < MAX_CHECKLIST_STEPS) plan.steps.push(step);
    } else if (event.type === ChatEventType.THINKING && event.content) {
      const active = isStreaming && event.isComplete === false;
      blocks.push({ kind: 'thinking', key: `k${index}`, content: event.content, active });
    } else if (event.type === ChatEventType.MESSAGE && event.content) {
      const content = event.isComplete === false ? tidyPartialMarkdown(event.content) : event.content;
      blocks.push({ kind: 'message', key: `m${index}`, content });
    } else if (event.type === ChatEventType.ASK && event.content) {
      const isComplete = event.isComplete !== false;
      const item: AskItem = {
        question: event.content,
        options: isComplete ? parseAnswerOptions(event.metadata) : [],
        isComplete,
      };
      if (prev?.kind === 'ask') prev.questions.push(item);
      else blocks.push({ kind: 'ask', key: `q${index}`, questions: [item] });
    } else if (event.type === ChatEventType.TOOL_LOG) {
      const files = (event.metadata ?? '').split(',').map((f) => f.trim()).filter(Boolean);
      const active = isStreaming && index === lastIndex;
      if (prev?.kind === 'reads') {
        prev.files = [...new Set([...prev.files, ...files])];
        prev.active = active;
      } else if (files.length > 0) {
        blocks.push({ kind: 'reads', key: `r${index}`, files, active });
      }
    } else if (isFileEvent(event) && event.filePath) {
      const path = event.filePath;
      const deleted = event.type === ChatEventType.FILE_DELETE;
      const block = build ?? openBuild(index, false);
      const step = stepFor(block, path);
      seenPaths.add(path);
      if (!deleted) lastWrittenPath = path;
      if (step.path === path) current = step;
      block.hasStarted = true;
      const active = isStreaming && event.isComplete === false;
      if (event.type === ChatEventType.FILE_PATCH) {
        const shown = step.files.find((file) => file.path === path && file.edited);
        if (shown) shown.active = active;
        else step.files.push({ path, active, edited: true });
        return;
      }
      step.files.push({
        path,
        active,
        ...(deleted
          ? { deleted: true }
          : { lines: lineCount(event.content), content: event.content, eventId: event.id, lesson: event.lesson || undefined }),
      });
    } else if (event.type === ChatEventType.LEARN && event.content) {
      if (event.filePath && lessonPaths.has(event.filePath)) return;
      if (event.filePath) lessonPaths.add(event.filePath);

      const isComplete = event.isComplete !== false;
      const parsed = parseLesson(event.content, event.metadata || undefined, isComplete);
      if (!isComplete) {
        parsed.summary = tidyPartialMarkdown(parsed.summary);
        if (parsed.why) parsed.why = tidyPartialMarkdown(parsed.why);
        parsed.parts = parsed.parts.map((part) => ({ ...part, text: tidyPartialMarkdown(part.text) }));
      }
      const quotesLines = parsed.parts.length > 0;
      const path = quotesLines && !(event.filePath && fileContents.has(event.filePath))
        ? lastWrittenPath ?? event.filePath
        : event.filePath;
      const lesson = { ...withLines(parsed, path ? fileContents.get(path) : undefined), isComplete };

      if (path) {
        const block = build ?? openBuild(index, false);
        stepFor(block, path).lessons.push({ path, lesson });
      } else if (openLessons) {
        openLessons.items.push({ path, lesson });
      } else {
        openLessons = { kind: 'lessons', key: `l${index}`, items: [{ path, lesson }] };
        blocks.push(openLessons);
      }
    }
  });

  for (const block of blocks) {
    if (block.kind !== 'build') continue;
    resolveSteps(block.steps, writtenPaths, isStreaming);
    block.isRunning = block.steps.some((step) => step.status === 'active');
  }

  return blocks.filter((block) => block.kind !== 'build' || block.steps.length > 0);
}

const blockOrder = (block: Block) => Number.parseInt(block.key.slice(1), 10) || 0;

function activityBlocks(events: ChatEvent[]): ActivityBlock[] {
  const planned = events.filter((event) => event.type === ChatEventType.TODO && event.content && event.filePath);
  const labels = new Map(planned.map((event) => [event.filePath as string, event.content]));
  const positions = new Map(planned.map((event, index) => [event.filePath as string, index + 1]));
  const total = positions.size;

  const blocks: ActivityBlock[] = [];
  const shown = new Map<string, ActivityItem>();
  let open: ActivityBlock | undefined;

  events.forEach((event, index) => {
    if (event.type === ChatEventType.TODO || event.type === ChatEventType.LEARN) return;
    if (!isFileEvent(event) || !event.filePath) {
      open = undefined;
      return;
    }
    const path = event.filePath;
    const file: StepFile = {
      path,
      active: event.isComplete === false,
      ...(event.type === ChatEventType.FILE_DELETE
        ? { deleted: true }
        : event.type === ChatEventType.FILE_PATCH
          ? { edited: true }
          : { lines: lineCount(event.content) }),
    };
    const earlier = shown.get(path);
    if (earlier) {
      earlier.file = file;
      return;
    }
    const position = positions.get(path);
    const item: ActivityItem = { key: `${index}`, label: labels.get(path), position, total: position ? total : undefined, file };
    shown.set(path, item);
    if (!open) {
      open = { kind: 'activity', key: `a${index}`, items: [] };
      blocks.push(open);
    }
    open.items.push(item);
  });
  return blocks;
}

export function displayBlocks(events: ChatEvent[], isStreaming: boolean): Block[] {
  const blocks = buildBlocks(events, isStreaming);
  const builds = blocks.filter((block) => block.kind === 'build');
  if (builds.length === 0) return blocks;

  const others = blocks.filter((block) => block.kind !== 'build');
  if (isStreaming) {
    return [...others, ...activityBlocks(events)].sort((one, other) => blockOrder(one) - blockOrder(other));
  }
  const questions = others.filter((block) => block.kind === 'ask');
  const story = [
    ...others.filter((block) => block.kind !== 'ask'),
    ...activityBlocks(events).map((block) => ({ ...block, isSummary: true })),
  ].sort((one, other) => blockOrder(one) - blockOrder(other));
  return [...story, ...builds, ...questions];
}

export function activitySummary(items: ActivityItem[]): string {
  const removed = items.filter((item) => item.file.deleted).length;
  const changed = items.length - removed;
  const parts = [];
  if (changed > 0) parts.push(`${changed} ${changed === 1 ? "file" : "files"} written`);
  if (removed > 0) parts.push(`${removed} removed`);
  return parts.join(", ");
}

function ActivityFold({ block, onOpen }: { block: ActivityBlock; onOpen?: OpenFile }) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsId = useId();

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={detailsId}
        onClick={() => setIsOpen((open) => !open)}
        className="group -ml-1.5 flex h-6 max-w-full items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary active:text-primary focus-visible:outline-none"
      >
        <FilePen className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0">{activitySummary(block.items)}</span>
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div id={detailsId} className="mt-1.5 border-l-2 border-white/[0.12] pl-3">
          <ActivityLines block={{ ...block, isSummary: false }} onOpen={onOpen} filesOnly />
        </div>
      )}
    </div>
  );
}

function ActivityLines({ block, onOpen, filesOnly = false }: { block: ActivityBlock; onOpen?: OpenFile; filesOnly?: boolean }) {
  if (block.isSummary) return <ActivityFold block={block} onOpen={onOpen} />;
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {block.items.map(({ key, label, position, total, file }) => (
        <li key={key} className="flex min-h-6 min-w-0 items-center gap-2 text-xs text-muted-foreground chat-enter">
          {file.active
            ? <OrbitSpinner className="h-3.5 w-3.5 shrink-0" />
            : <Check className="h-3.5 w-3.5 shrink-0 text-primary/80" />}
          {!filesOnly && (
            <span className={cn("min-w-0 truncate", file.active ? "text-shimmer font-medium" : "text-foreground/80")}>
              {label ?? (file.deleted ? "Removing a file" : file.edited ? "Changing a file" : "Writing a file")}
            </span>
          )}
          <StepFileChip file={{ ...file, active: false }} onOpen={file.active ? undefined : onOpen} />
          {!filesOnly && position && total && (
            <span className="ml-auto shrink-0 pl-2 tabular-nums text-muted-foreground/60">{position}/{total}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function FileChip({ path, onOpen }: { path: string; onOpen?: (path: string) => void }) {
  const Icon = getFileIcon(path);
  const className =
    "inline-flex h-6 max-w-[220px] items-center gap-1.5 rounded-full border border-white/[0.12] bg-[hsl(var(--ws-card))] px-2 text-[11.5px] text-foreground/90 transition-colors";
  const content = (
    <>
      <Icon className={cn("h-3 w-3 shrink-0", getFileColor(path))} />
      <span className="truncate">{splitPath(path).base}</span>
    </>
  );

  if (!onOpen) return <span title={path} className={className}>{content}</span>;
  return (
    <button
      type="button"
      title={`Open ${path}`}
      onClick={() => onOpen(path)}
      className={cn(className, "duration-200 hover:border-primary/45 hover:bg-primary/[0.12] hover:text-white")}
    >
      {content}
    </button>
  );
}

function ReadsBlock({ files, active, onOpen }: { files: string[]; active: boolean; onOpen?: (path: string) => void }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="flex h-6 shrink-0 items-center gap-1.5">
        {active ? <OrbitSpinner className="h-3.5 w-3.5" /> : <FileSearch className="h-3.5 w-3.5" />}
        {active ? "Reading" : "Read"}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {files.map((file) => <FileChip key={file} path={file} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function ThinkingBlock({ content, active, isStreaming }: { content: string; active: boolean; isStreaming: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsId = useId();
  const steps = useMemo(() => thoughtSteps(content, !active), [content, active]);
  const { shown, isRevealing } = useStepReveal(steps.length, isStreaming, active);
  const visible = steps.slice(0, shown);
  const latest = visible[visible.length - 1];

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={detailsId}
        onClick={() => setIsOpen((open) => !open)}
        className="group -ml-1.5 flex h-6 max-w-full items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary active:text-primary focus-visible:outline-none"
      >
        {isRevealing ? <OrbitSpinner className="h-3.5 w-3.5 shrink-0" /> : <Lightbulb className="h-3.5 w-3.5 shrink-0" />}
        <span className={cn("shrink-0", isRevealing && "text-shimmer font-medium")}>
          {isRevealing ? "Thinking" : "Thought process"}
        </span>
        {isRevealing && latest && (
          <span key={shown} className="min-w-0 truncate text-muted-foreground/80 animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:animate-none">
            {latest}
          </span>
        )}
        {!isRevealing && steps.length > 1 && (
          <span className="shrink-0 tabular-nums text-muted-foreground/70">{steps.length} steps</span>
        )}
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <ol id={detailsId} className="mt-1.5 space-y-1.5 border-l-2 border-white/[0.12] pl-3">
          {visible.map((step, index) => (
            <li
              key={index}
              className="flex gap-2 break-words text-[12.5px] leading-[1.65] text-muted-foreground animate-in fade-in slide-in-from-left-1 duration-500 motion-reduce:animate-none"
            >
              <span aria-hidden="true" className="w-3 shrink-0 pt-px text-right text-[10.5px] tabular-nums text-muted-foreground/60">
                {index + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
          {isRevealing && visible.length === 0 && (
            <li className="text-[12.5px] text-muted-foreground/70">Working it out&hellip;</li>
          )}
        </ol>
      )}
    </div>
  );
}

function AskBlock({ questions, onAnswer }: { questions: AskItem[]; onAnswer?: (answer: string) => void }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const isSingle = questions.length === 1;
  const hasArrived = questions.every((question) => question.isComplete);
  const canAnswer = !!onAnswer && hasArrived;
  const canSend = canAnswer && !isSingle && isFullyAnswered(questions, answers);

  const pick = (index: number, option: string) => {
    if (!canAnswer) return;
    if (isSingle) {
      onAnswer(formatAnswers(questions, { 0: option }));
      return;
    }
    setAnswers((prev) => ({ ...prev, [index]: prev[index] === option ? '' : option }));
  };

  return (
    <div className="chat-tile overflow-hidden rounded-xl">
      <div className="chat-tile-head flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground/90">
        <CircleHelp className="h-3.5 w-3.5 text-primary" />
        {isSingle ? 'A quick question' : `${questions.length} quick questions`}
      </div>
      <div className="flex flex-col gap-3 px-3 py-3">
        {questions.map((question, index) => (
          <div key={index} role="group" aria-label={question.question} className="flex flex-col gap-2">
            <p className="text-[13px] leading-5 text-foreground">{question.question}</p>
            {question.options.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {question.options.map((option) => {
                  const isPicked = answers[index] === option;
                  return canAnswer ? (
                    <button
                      key={option}
                      type="button"
                      onClick={() => pick(index, option)}
                      aria-pressed={isSingle ? undefined : isPicked}
                      className={cn(
                        'app-chip inline-flex min-h-7 items-center gap-1.5 border px-2.5 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isPicked
                          ? 'border-primary/60 bg-primary/15 text-foreground'
                          : 'border-white/10 bg-black/20 text-foreground/85 hover:border-primary/40 hover:text-foreground'
                      )}
                    >
                      {isPicked && <Check className="h-3 w-3 text-primary" />}
                      {option}
                    </button>
                  ) : (
                    <span key={option} className="inline-flex min-h-7 items-center rounded-full border border-white/[0.06] px-2.5 py-1 text-xs text-muted-foreground">
                      {option}
                    </span>
                  );
                })}
              </div>
            )}
            {canAnswer && !isSingle && question.options.length === 0 && (
              <input
                value={answers[index] ?? ''}
                maxLength={200}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [index]: e.target.value }))}
                placeholder="Type your answer"
                aria-label={question.question}
                className="app-field h-8 rounded-lg px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
              />
            )}
          </div>
        ))}
        {canAnswer && (
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
            <span>{isSingle ? 'Pick one, or type your own answer below.' : 'Pick an answer for each, or just reply below in your own words.'}</span>
            {!isSingle && (
              <button
                type="button"
                disabled={!canSend}
                onClick={() => onAnswer(formatAnswers(questions, answers))}
                className="app-chip inline-flex h-7 shrink-0 items-center gap-1.5 border border-primary/50 bg-primary/15 px-2.5 text-xs text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <ArrowUp className="h-3 w-3" />
                Send answers
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LessonText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={index} className="rounded bg-muted px-1 py-px font-mono text-[11px] text-foreground">
            {part.slice(1, -1)}
          </code>
        ) : part.length > 4 && part.startsWith("**") && part.endsWith("**") ? (
          <mark key={index} className="rounded-sm bg-primary/[0.14] px-0.5 font-semibold text-foreground">
            {part.slice(2, -2)}
          </mark>
        ) : (
          <Fragment key={index}>{part.replace(/\*\*/g, "")}</Fragment>
        )
      )}
    </>
  );
}

const EXCERPT_LINES = 7;

function CodeExcerpt({ lines, startLine, onClick }: { lines: string[]; startLine: number; onClick?: () => void }) {
  if (lines.length === 0) return null;
  const shown = lines.slice(0, EXCERPT_LINES);
  const hidden = lines.length - shown.length;
  const gutter = String(startLine + shown.length - 1).length;
  const body = (
    <>
      {shown.map((line, index) => (
        <span key={index} className="flex min-w-0 gap-3">
          <span aria-hidden="true" className="shrink-0 select-none text-right tabular-nums text-primary/70" style={{ minWidth: `${gutter}ch` }}>
            {startLine + index}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre text-foreground/90">{line || " "}</span>
        </span>
      ))}
      {hidden > 0 && <span className="block pl-[calc(var(--gutter)+0.75rem)] text-muted-foreground">+ {hidden} more {hidden === 1 ? "line" : "lines"}</span>}
    </>
  );
  const className =
    "mt-1.5 block w-full min-w-0 rounded-md border border-primary/25 border-l-2 border-l-primary/70 bg-primary/[0.06] px-2.5 py-1.5 text-left font-mono text-[11px] leading-[1.6]";
  const style = { "--gutter": `${gutter}ch` } as CSSProperties;

  if (!onClick) return <code className={className} style={style}>{body}</code>;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Show these lines in the editor"
      style={style}
      className={cn(className, "transition-colors duration-200 hover:border-primary/50 hover:bg-primary/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {body}
    </button>
  );
}

function WalkthroughNoteView({ note, path, content, onOpen }: {
  note: ReturnType<typeof parseWalkthrough>["notes"][number];
  path: string;
  content: string;
  onOpen?: OpenFile;
}) {
  const range = note.startLine === note.endLine ? `L${note.startLine}` : `L${note.startLine}–${note.endLine}`;
  const show = onOpen ? () => onOpen(path, { line: note.startLine, endLine: note.endLine }) : undefined;
  const excerpt = linesOf(content, note.startLine, note.endLine);

  return (
    <li className="min-w-0 animate-in fade-in duration-500 motion-reduce:animate-none">
      <div className="flex min-w-0 items-center gap-2">
        {show ? (
          <button
            type="button"
            onClick={show}
            title={`Show ${range} in the editor`}
            className="app-chip inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/[0.1] px-1.5 font-mono text-[10.5px] tabular-nums text-primary"
          >
            {range}
            <ArrowUpRight className="h-3 w-3" />
          </button>
        ) : (
          <span className="inline-flex h-[22px] shrink-0 items-center rounded-md border border-primary/40 bg-primary/[0.1] px-1.5 font-mono text-[10.5px] tabular-nums text-primary">
            {range}
          </span>
        )}
        <span className="min-w-0 break-words text-[12.5px] font-medium leading-5 text-foreground">{note.title}</span>
      </div>
      <CodeExcerpt lines={excerpt} startLine={note.startLine} onClick={show} />
      {note.text && (
        <p className="mt-1.5 break-words text-[12.5px] leading-[1.7] text-foreground/80">
          <LessonText text={note.text} />
        </p>
      )}
      {!note.isComplete && !note.text && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <OrbitSpinner className="h-3 w-3" />
          Writing&hellip;
        </p>
      )}
    </li>
  );
}

const canTeach = (file: StepFile) => file.eventId !== undefined && !file.deleted && !file.active && !!file.content?.trim();

function LessonToggle({ file, isOpen, panelId, onToggle }: {
  file: StepFile;
  isOpen: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  const name = splitPath(file.path).base;
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={panelId}
      aria-label={`What this step changed in ${name}`}
      title={isOpen ? "Hide the lesson" : `Learn what this step changed in ${name}`}
      onClick={onToggle}
      className={cn(
        "hl-row flex h-6 w-6 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isOpen ? "bg-primary/[0.14] text-primary" : "text-primary/75"
      )}
    >
      <GraduationCap className="h-3.5 w-3.5" />
    </button>
  );
}

function StepLesson({ projectId, file, panelId, showFile, onOpen }: {
  projectId: string;
  file: StepFile;
  panelId: string;
  showFile?: boolean;
  onOpen?: OpenFile;
}) {
  const code = file.content ?? "";
  const eventId = file.eventId as number;
  const live = useLesson(lessonKey(projectId, eventId));
  const state = useMemo<LessonState | undefined>(
    () => live ?? (file.lesson ? { status: "done", text: file.lesson } : undefined),
    [live, file.lesson]
  );
  const walkthrough = useMemo(
    () => (state ? parseWalkthrough(state.text, state.status === "done") : null),
    [state]
  );
  const name = splitPath(file.path).base;
  const hasSaved = !!file.lesson;
  const ask = () => { requestLesson(projectId, eventId); };
  useEffect(() => {
    if (!hasSaved) requestLesson(projectId, eventId);
  }, [projectId, eventId, hasSaved]);
  const isWriting = state?.status === "loading";
  const hasText = !!walkthrough && (walkthrough.overview !== "" || walkthrough.notes.length > 0);

  return (
    <div id={panelId} className="relative mb-2 ml-[34px] mr-3 mt-1 min-w-0 space-y-3 pb-1 pl-3 before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[2px] before:rounded-full before:bg-primary/60">
      {showFile && (
        <p className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary">
          <GraduationCap className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono normal-case tracking-normal">{name}</span>
        </p>
      )}

      {state?.status === "error" && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <CircleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="min-w-0 break-words">{state.error ?? "Couldn't write the lesson."}</span>
          <button type="button" onClick={ask} className="app-chip inline-flex h-6 items-center rounded-md px-2 text-[11.5px] text-foreground/85">
            Try again
          </button>
        </div>
      )}

      {!hasText && state?.status !== "error" && (
        <div className="space-y-2" aria-label="Writing the lesson">
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <OrbitSpinner className="h-3 w-3" />
            Looking at what changed in {name}&hellip;
          </p>
          {[78, 92, 64].map((width) => (
            <div key={width} className="h-2.5 animate-pulse rounded bg-white/[0.06]" style={{ width: `${width}%` }} />
          ))}
        </div>
      )}

      {walkthrough?.overview && (
        <p className="break-words text-[12.5px] leading-[1.7] text-foreground/90">
          <LessonText text={walkthrough.overview} />
        </p>
      )}

      {walkthrough && walkthrough.notes.length > 0 && (
        <ol className="space-y-4">
          {walkthrough.notes.map((note, index) => (
            <WalkthroughNoteView key={index} note={note} path={file.path} content={code} onOpen={onOpen} />
          ))}
        </ol>
      )}

      {walkthrough?.closing && walkthrough.closing.text && (
        <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
          <p className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary">
            <Lightbulb className="h-3 w-3" />
            {walkthrough.closing.title}
          </p>
          <p className="break-words text-[12.5px] leading-[1.7] text-foreground/80">
            <LessonText text={walkthrough.closing.text} />
          </p>
        </div>
      )}

      {isWriting && hasText && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <OrbitSpinner className="h-3 w-3" />
          Still writing&hellip;
        </p>
      )}
    </div>
  );
}

function FoldedLessons({ label, children }: { label: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "hl-row -ml-1.5 flex h-6 max-w-full items-center gap-1.5 rounded-md px-1.5 text-[11.5px] focus-visible:outline-none",
          isOpen ? "text-primary" : "text-muted-foreground"
        )}
      >
        <GraduationCap className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", !isOpen && "-rotate-90")} />
      </button>
      {isOpen && <div id={panelId} className="mt-1.5 space-y-3">{children}</div>}
    </div>
  );
}

function CodeReference({ path, part, showFile, onOpen }: {
  path?: string;
  part: LessonPart;
  showFile?: boolean;
  onOpen?: OpenFile;
}) {
  const className =
    "flex min-w-0 max-w-full items-center gap-2 rounded-md border border-white/[0.1] bg-[hsl(var(--ws-well))] px-1.5 py-0.5 text-left font-mono text-[11px]";
  const content = (
    <>
      {showFile && path && (
        <span className="shrink-0 max-w-[45%] truncate text-muted-foreground">{splitPath(path).base}</span>
      )}
      {part.line !== undefined && <span className="shrink-0 tabular-nums text-primary">L{part.line}</span>}
      <span className="min-w-0 truncate text-foreground/85">{part.code}</span>
    </>
  );

  if (!onOpen || !path) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      title={part.line !== undefined ? `Show line ${part.line} of ${path}` : `Find this in ${path}`}
      onClick={() => onOpen(path, { line: part.line, code: part.code })}
      className={cn(className, "transition-colors duration-200 hover:border-primary/40 hover:bg-primary/[0.1]")}
    >
      {content}
    </button>
  );
}

function LessonBody({ item, stepLabel, showFile, onOpen, onExplain }: {
  item: LessonItem;
  stepLabel?: string;
  showFile?: boolean;
  onOpen?: OpenFile;
  onExplain?: ExplainStep;
}) {
  const { lesson, path } = item;
  const [showsLines, setShowsLines] = useState(false);
  const linesId = useId();
  const firstConcept = lesson.concepts[0];
  const canExplain = !!onExplain && !!path && lesson.isComplete;

  return (
    <div className="relative min-w-0 py-0.5 pl-3 before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[2px] before:rounded-full before:bg-primary/60">
      {showFile && path && (
        <p className="mb-1.5 flex min-w-0 items-center gap-1.5">
          <FileChip path={path} onOpen={onOpen ? (file) => onOpen(file) : undefined} />
        </p>
      )}

      {lesson.summary && (
        <p className="break-words text-[12.5px] leading-[1.7] text-foreground/90">
          <LessonText text={lesson.summary} />
        </p>
      )}

      {lesson.why && (
        <p className="mt-1.5 break-words text-[12.5px] leading-[1.7] text-foreground/75">
          <span className="mr-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary">Why</span>
          <LessonText text={lesson.why} />
        </p>
      )}

      {!lesson.isComplete && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <OrbitSpinner className="h-3 w-3" />
          Still writing&hellip;
        </p>
      )}

      {lesson.isComplete && (firstConcept || canExplain || lesson.parts.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {firstConcept && lesson.parts.length === 0 && (
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-white/[0.06] px-2 text-[10.5px] font-medium text-primary">
              <GraduationCap className="h-3 w-3" />
              {firstConcept}
            </span>
          )}
          {lesson.parts.length > 0 && (
            <button
              type="button"
              aria-expanded={showsLines}
              aria-controls={linesId}
              onClick={() => setShowsLines((shown) => !shown)}
              className="hl-row -ml-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground focus-visible:outline-none"
            >
              Line by line
              <span className="tabular-nums">({lesson.parts.length})</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", !showsLines && "-rotate-90")} />
            </button>
          )}
          {canExplain && (
            <button
              type="button"
              onClick={() => onExplain({ path, label: stepLabel ?? splitPath(path).base, what: lesson.summary })}
              title={`Walk through ${path} line by line in ExplainLLM`}
              className="app-chip inline-flex h-[22px] items-center gap-1.5 rounded-full border border-white/10 px-2 text-[11px] text-foreground/85"
            >
              <MessagesSquare className="h-3 w-3" />
              Explain in detail
            </button>
          )}
        </div>
      )}

      {showsLines && lesson.parts.length > 0 && (
        <ol id={linesId} className="mt-3 space-y-3.5">
          {lesson.parts.map((part, index) => (
            <li key={index} className="min-w-0">
              {part.code && <CodeReference path={path} part={part} showFile={showFile} onOpen={onOpen} />}
              {(part.text || part.concept) && (
                <p className={cn("break-words text-[12px] leading-[1.7] text-foreground/80", part.code && "mt-1.5")}>
                  <LessonText text={part.text} />
                  {part.concept && (
                    <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-white/[0.06] px-1.5 align-middle text-[10.5px] font-medium text-primary">
                      {part.concept}
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StepFileChip({ file, onOpen }: { file: StepFile; onOpen?: OpenFile }) {
  const Icon = getFileIcon(file.path);
  const { base } = splitPath(file.path);
  const className = "inline-flex h-6 min-w-0 max-w-[230px] items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px]";
  const content = (
    <>
      {file.active
        ? <OrbitSpinner className="h-3 w-3" />
        : file.deleted
          ? <Trash2 className="h-3 w-3 shrink-0 text-destructive/80" />
          : <Icon className={cn("h-3 w-3 shrink-0", getFileColor(file.path))} />}
      <span className={cn("truncate", file.deleted ? "text-muted-foreground line-through decoration-muted-foreground/60" : "text-foreground/85")}>
        {base}
      </span>
      {file.deleted
        ? <span className="shrink-0 font-sans text-muted-foreground">Deleted</span>
        : file.edited
          ? <span className="shrink-0 font-sans text-muted-foreground">{file.active ? "Editing" : "Edited"}</span>
          : !!file.lines && <span className="shrink-0 font-sans tabular-nums text-muted-foreground">{file.lines} {file.lines === 1 ? "line" : "lines"}</span>}
    </>
  );

  if (!onOpen || file.deleted) return <span title={file.path} className={className}>{content}</span>;
  return (
    <button
      type="button"
      title={file.lines ? `Open ${file.path} (${file.lines} lines)` : `Open ${file.path}`}
      onClick={() => onOpen(file.path)}
      className={cn(className, "hl-row focus-visible:outline-none")}
    >
      {content}
    </button>
  );
}

function buildTitle(block: BuildBlock, isStreaming: boolean) {
  const steps = block.steps;
  const fileCount = steps.reduce((total, step) => total + step.files.length, 0);
  if (!block.isPlanned) {
    const files = `${fileCount} ${fileCount === 1 ? "file" : "files"}`;
    const hasDelete = steps.some((step) => step.files.some((file) => file.deleted));
    return hasDelete ? `${block.isRunning ? "Changing" : "Changed"} ${files}` : `${block.isRunning ? "Editing" : "Edited"} ${files}`;
  }
  if (isStreaming && !block.hasStarted) return "Plan";
  if (block.isRunning) return "Building";
  return steps.every((step) => step.status === 'done') ? "Built" : "Build steps";
}

function StepRow({ step, index, isStreaming, teaching, projectId, onOpen, onExplain }: {
  step: BuildStep;
  index: number;
  isStreaming: boolean;
  teaching?: boolean;
  projectId?: string;
  onOpen?: OpenFile;
  onExplain?: ExplainStep;
}) {
  const [openLesson, setOpenLesson] = useState<number | null>(null);
  const panelId = useId();
  const hasOwnRowFile = step.files.length <= 1;
  const rowFile = hasOwnRowFile ? step.files[0] : undefined;
  const plannedName = !rowFile && hasOwnRowFile && step.path && !step.isExtra ? splitPath(step.path).base : undefined;
  const showFileOnLessons = step.lessons.length > 1;
  const teaches = !!teaching && !!projectId && !isStreaming && step.lessons.length === 0 && step.status === 'done';
  const taught = openLesson !== null ? step.files[openLesson] : undefined;
  const toggleFor = (file: StepFile, fileIndex: number) =>
    teaches && canTeach(file) ? (
      <LessonToggle
        file={file}
        isOpen={openLesson === fileIndex}
        panelId={panelId}
        onToggle={() => setOpenLesson((open) => (open === fileIndex ? null : fileIndex))}
      />
    ) : null;

  return (
    <li data-status={step.status}>
      <div className="flex min-h-7 min-w-0 items-center gap-2 py-0.5 pl-3 pr-2">
        {step.status === 'done' ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />
        ) : step.status === 'active' ? (
          <OrbitSpinner className="h-3.5 w-3.5" />
        ) : (
          <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[10px] tabular-nums text-muted-foreground/70">
            {index + 1}
          </span>
        )}
        {!(step.isExtra && rowFile) && (
          <span
            className={cn(
              "min-w-0 truncate text-[12px] transition-colors",
              step.status === 'done' && "text-foreground/80",
              step.status === 'active' && "text-foreground",
              step.status === 'pending' && "text-muted-foreground/75"
            )}
          >
            {step.label}
          </span>
        )}
        {rowFile && !step.isExtra && toggleFor(rowFile, 0)}
        {rowFile && (
          <span className={cn("flex min-w-0 shrink-0", !step.isExtra && "ml-auto pl-2")}>
            <StepFileChip file={rowFile} onOpen={onOpen} />
          </span>
        )}
        {rowFile && step.isExtra && toggleFor(rowFile, 0)}
        {plannedName && (
          <span title={step.path} className="ml-auto shrink-0 pl-2 pr-1.5 font-mono text-[11px] text-muted-foreground/70">
            {plannedName}
          </span>
        )}
      </div>
      {!hasOwnRowFile && (
        <div className="flex flex-wrap gap-x-1 pb-1 pl-[30px] pr-2">
          {step.files.map((file, fileIndex) => (
            <span key={`${file.path}-${fileIndex}`} className="flex min-w-0 items-center">
              <StepFileChip file={file} onOpen={onOpen} />
              {toggleFor(file, fileIndex)}
            </span>
          ))}
        </div>
      )}
      {step.lessons.length > 0 && (
        <div className="mb-2 ml-[34px] mr-3 mt-0.5">
          <FoldedLessons label={step.lessons.length > 1 ? `What this step does (${step.lessons.length})` : "What this step does"}>
            {step.lessons.map((item, lessonIndex) => (
              <LessonBody
                key={`${item.path ?? "lesson"}-${lessonIndex}`}
                item={item}
                stepLabel={step.isExtra ? undefined : step.label}
                showFile={showFileOnLessons}
                onOpen={onOpen}
                onExplain={isStreaming ? undefined : onExplain}
              />
            ))}
          </FoldedLessons>
        </div>
      )}
      {teaches && !!projectId && taught && canTeach(taught) && (
        <StepLesson
          key={taught.eventId}
          projectId={projectId}
          file={taught}
          panelId={panelId}
          showFile={!hasOwnRowFile}
          onOpen={onOpen}
        />
      )}
    </li>
  );
}

function BuildCard({ block, isStreaming, teaching, projectId, onOpen, onExplain }: {
  block: BuildBlock;
  isStreaming: boolean;
  teaching?: boolean;
  projectId?: string;
  onOpen?: OpenFile;
  onExplain?: ExplainStep;
}) {
  const { steps } = block;
  const doneCount = steps.filter((step) => step.status === 'done').length;
  const title = buildTitle(block, isStreaming);

  return (
    <div className="chat-tile overflow-hidden rounded-xl">
      <div className="chat-tile-head flex h-8 items-center gap-2 px-3 text-xs">
        {block.isRunning
          ? <OrbitSpinner className="h-3.5 w-3.5" />
          : block.isPlanned
            ? <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
            : <FilePen className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground/90">{title}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {block.isPlanned && (
            <span className="tabular-nums text-muted-foreground" aria-label={`${doneCount} of ${steps.length} steps done`}>
              {doneCount}/{steps.length}
            </span>
          )}
        </div>
      </div>
      <ol className="py-1">
        {steps.map((step, index) => (
          <StepRow
            key={`${step.label}-${index}`}
            step={step}
            index={index}
            isStreaming={isStreaming}
            teaching={teaching}
            projectId={projectId}
            onOpen={onOpen}
            onExplain={onExplain}
          />
        ))}
      </ol>
    </div>
  );
}

function LessonsBlock({ items, onOpen }: { items: LessonItem[]; onOpen?: OpenFile }) {
  return (
    <div className="chat-tile overflow-hidden rounded-xl">
      <div className="chat-tile-head flex h-8 items-center gap-2 px-3 text-xs">
        <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/90">About this change</span>
      </div>
      <div className="px-3 py-2">
        <FoldedLessons label={items.length > 1 ? `Read the explanations (${items.length})` : "Read the explanation"}>
          {items.map((item, index) => <LessonBody key={index} item={item} onOpen={onOpen} />)}
        </FoldedLessons>
      </div>
    </div>
  );
}

interface AssistantEventsProps {
  events: ChatEvent[];
  isStreaming: boolean;
  isIdle: boolean;
  status?: string;
  startedAt?: string;
  fallbackThought?: string;
  onOpenFile?: OpenFile;
  onAnswer?: (answer: string) => void;
  onExplainStep?: ExplainStep;
  teaching?: boolean;
  projectId?: string;
}

function WorkingFor({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = (now - Date.parse(since)) / 1000;
  return <>Working for {formatWorkedFor(Number.isFinite(seconds) ? seconds : 1)}</>;
}

export function AssistantEvents({ events, isStreaming, isIdle, status, startedAt, fallbackThought, onOpenFile, onAnswer, onExplainStep, teaching, projectId }: AssistantEventsProps) {
  const thought = events.find((event) => event.type === ChatEventType.THOUGHT)?.content ?? fallbackThought;
  const blocks = displayBlocks(events, isStreaming);

  const lastEvent = events[events.length - 1];
  const lastBlock = blocks[blocks.length - 1];
  const hasBusyBlock = blocks.some(
    (block) =>
      (block.kind === 'thinking' && block.active) ||
      (block.kind === 'activity' && block.items.some((item) => item.file.active)) ||
      (block.kind === 'build' && block.steps.some((step) =>
        step.files.some((file) => file.active) || step.lessons.some((one) => !one.lesson.isComplete))) ||
      (block.kind === 'lessons' && block.items.some((item) => !item.lesson.isComplete))
  ) || (lastBlock?.kind === 'reads' && lastBlock.active);
  const isTyping = lastEvent?.type === ChatEventType.MESSAGE && lastEvent.isComplete === false;
  const showWorking = isStreaming && !isTyping && (!!status || (!hasBusyBlock && (events.length === 0 || isIdle)));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HorizonMark className="h-5 w-5" title="Singularity" />
        {thought ? (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {thought}
          </span>
        ) : isStreaming && startedAt ? (
          <span className="flex items-center gap-1 tabular-nums">
            <Clock className="h-3 w-3" />
            <WorkingFor since={startedAt} />
          </span>
        ) : null}
      </div>

      {blocks.map((block) => {
        switch (block.kind) {
          case 'thinking':
            return <ThinkingBlock key={block.key} content={block.content} active={block.active} isStreaming={isStreaming} />;
          case 'message':
            return (
              <ChatMarkdown key={block.key}>{block.content}</ChatMarkdown>
            );
          case 'reads':
            return <ReadsBlock key={block.key} files={block.files} active={block.active} onOpen={onOpenFile} />;
          case 'activity':
            return <ActivityLines key={block.key} block={block} onOpen={onOpenFile} />;
          case 'build':
            return <BuildCard key={block.key} block={block} isStreaming={isStreaming} teaching={teaching} projectId={projectId} onOpen={onOpenFile} onExplain={onExplainStep} />;
          case 'lessons':
            return <LessonsBlock key={block.key} items={block.items} onOpen={onOpenFile} />;
          case 'ask':
            return <AskBlock key={block.key} questions={block.questions} onAnswer={isStreaming ? undefined : onAnswer} />;
        }
      })}

      {showWorking && (
        <div className="flex h-6 items-center gap-2 text-xs">
          <OrbitSpinner className="h-3.5 w-3.5" />
          <span className="text-shimmer font-medium">{status ?? (events.length === 0 ? "Thinking" : "Working")}&hellip;</span>
        </div>
      )}
    </div>
  );
}

export function AssistantError({ message }: { message: string }) {
  return (
    <div className="chat-enter flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/[0.07] px-3 py-2.5 text-xs">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">This response didn&rsquo;t finish</p>
        <p className="mt-0.5 break-words text-muted-foreground">{message} &mdash; try sending your request again.</p>
      </div>
    </div>
  );
}
