/**
 * Renders an assistant turn: the thought, the build checklist, the files it wrote, the lessons it taught, any
 * question it put to the user, and the prose in between.
 *
 * Handles: grouping the raw events into blocks, resolving each checklist step's status as the turn progresses,
 * folding teaching-mode walkthroughs underneath the step that wrote their file, opening a file at the line a lesson
 * or message points at, showing a turn's questions with their suggested answers (one question is answered with a
 * click; several are picked and then sent together), and the separate rendering for a turn that ended in an error.
 *
 * A question can only be answered on the newest turn while nothing is streaming; on an older turn its suggestions are
 * shown as plain text, since the conversation has already moved past them.
 *
 * The checklist has a hard cap matching the parser's, so the live view shows exactly what gets saved. Its real length
 * is set by the work - the model is told to emit one step per file - so the cap only bites when it ignores that.
 *
 * The blocks are cards a step lighter than the chat window with a lighter head (index.css, .chat-tile), their rows
 * and toggles take the app's row highlight (.hl-row) under the pointer, anything under way shows the app's comet
 * (OrbitSpinner) rather than a spinning icon, and the turn is signed with the horizon mark (HorizonMark).
 */
import { Fragment, useId, useState } from 'react';
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Circle, CircleAlert, CircleHelp, Clock, FilePen, FileSearch, GraduationCap, ListChecks, Trash2 } from 'lucide-react';
import { HorizonMark } from '@/components/HorizonMark';
import { OrbitSpinner } from '@/components/app/OrbitSpinner';
import { ChatMarkdown } from '@/components/ChatMarkdown';
import { ChatEvent, ChatEventType } from '@/lib/types';
import { type AskedQuestion, formatAnswers, isFullyAnswered, parseAnswerOptions } from '@/lib/ask';
import { getFileColor, getFileIcon, splitPath } from '@/lib/file-icons';
import { type CodeTarget, type Lesson, type LessonPart, parseLesson, withLines } from '@/lib/lesson';
import { cn } from '@/lib/utils';

type OpenFile = (path: string, target?: CodeTarget) => void;

type ChecklistItem = { label: string; path?: string; status: 'done' | 'active' | 'pending'; lessons: LessonItem[] };

type RawStep = { label: string; path?: string; lessons: LessonItem[] };

const MAX_CHECKLIST_STEPS = 12;

type LessonView = Lesson & { isComplete: boolean };
type EditItem = { path: string; active: boolean; deleted?: boolean };
type LessonItem = { path?: string; lesson: LessonView };
type AskItem = AskedQuestion & { isComplete: boolean };

type Block =
  | { kind: 'message'; key: string; content: string }
  | { kind: 'reads'; key: string; files: string[]; active: boolean }
  | { kind: 'checklist'; key: string; items: ChecklistItem[] }
  | { kind: 'edits'; key: string; items: EditItem[] }
  | { kind: 'lessons'; key: string; items: LessonItem[] }
  | { kind: 'ask'; key: string; questions: AskItem[] };

function tidyPartialMarkdown(text: string) {
  let tidy = text;
  if ((tidy.match(/\*\*/g)?.length ?? 0) % 2 === 1) tidy = tidy.replace(/\*\*(?!.*\*\*)/s, "");
  if (!tidy.includes("```") && (tidy.match(/`/g)?.length ?? 0) % 2 === 1) tidy = tidy.replace(/`(?!.*`)/s, "");
  return tidy;
}

function resolveChecklist(
  items: RawStep[],
  writtenPaths: Set<string>,
  isStreaming: boolean
): ChecklistItem[] {
  const done = items.map((item) => !!item.path && writtenPaths.has(item.path));
  for (let i = items.length - 2; i >= 0; i--) {
    if (done[i + 1]) done[i] = true;
  }
  if (!isStreaming) {
    items.forEach((item, i) => { if (!item.path) done[i] = true; });
  }
  const activeIndex = isStreaming ? done.indexOf(false) : -1;

  return items.map((item, i) => ({
    ...item,
    status: done[i] ? 'done' : i === activeIndex ? 'active' : 'pending',
  }));
}

function findLessonStep(checklists: Map<string, RawStep[]>, path: string | undefined): RawStep | undefined {
  let current: RawStep | undefined;
  for (const steps of checklists.values()) {
    for (const step of steps) {
      if (path && step.path === path && step.lessons.length === 0) return step;
      if (step.lessons.length > 0) current = step;
    }
  }
  return current;
}

export function buildBlocks(events: ChatEvent[], isStreaming: boolean): Block[] {
  const blocks: Block[] = [];
  const lastIndex = events.length - 1;
  const lessonPaths = new Set<string>();

  const writtenPaths = new Set(
    events
      .filter((event) => (event.type === ChatEventType.FILE_EDIT || event.type === ChatEventType.FILE_DELETE)
        && event.filePath && event.isComplete !== false)
      .map((event) => event.filePath as string)
  );
  const fileContents = new Map(
    events
      .filter((event) => event.type === ChatEventType.FILE_EDIT && event.filePath)
      .map((event) => [event.filePath as string, event.content])
  );
  const rawChecklists = new Map<string, RawStep[]>();
  let openEdits: Extract<Block, { kind: 'edits' }> | undefined;
  let openLessons: Extract<Block, { kind: 'lessons' }> | undefined;
  let lastWrittenPath: string | undefined;

  events.forEach((event, index) => {
    const prev = blocks[blocks.length - 1];
    if (event.type !== ChatEventType.FILE_EDIT && event.type !== ChatEventType.FILE_DELETE && event.type !== ChatEventType.LEARN) {
      openEdits = undefined;
      openLessons = undefined;
    }

    if (event.type === ChatEventType.TODO && event.content) {
      const item: RawStep = { label: event.content, path: event.filePath, lessons: [] };
      if (prev?.kind === 'checklist') {
        const steps = rawChecklists.get(prev.key)!;
        if (steps.length < MAX_CHECKLIST_STEPS) steps.push(item);
      } else {
        const key = `t${index}`;
        rawChecklists.set(key, [item]);
        blocks.push({ kind: 'checklist', key, items: [] });
      }
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
    } else if (event.type === ChatEventType.FILE_EDIT && event.filePath) {
      lastWrittenPath = event.filePath;
      const item = { path: event.filePath, active: isStreaming && event.isComplete === false };
      if (openEdits) openEdits.items.push(item);
      else {
        openEdits = { kind: 'edits', key: `e${index}`, items: [item] };
        blocks.push(openEdits);
      }
    } else if (event.type === ChatEventType.FILE_DELETE && event.filePath) {
      const item = { path: event.filePath, active: isStreaming && event.isComplete === false, deleted: true };
      if (openEdits) openEdits.items.push(item);
      else {
        openEdits = { kind: 'edits', key: `e${index}`, items: [item] };
        blocks.push(openEdits);
      }
    } else if (event.type === ChatEventType.LEARN && event.content) {
      if (event.filePath && lessonPaths.has(event.filePath)) return;
      if (event.filePath) lessonPaths.add(event.filePath);

      const isComplete = event.isComplete !== false;
      const parsed = parseLesson(event.content, event.metadata || undefined, isComplete);
      if (!isComplete) {
        parsed.summary = tidyPartialMarkdown(parsed.summary);
        parsed.parts = parsed.parts.map((part) => ({ ...part, text: tidyPartialMarkdown(part.text) }));
      }
      const path = event.filePath && fileContents.has(event.filePath) ? event.filePath : lastWrittenPath ?? event.filePath;
      const lesson = { ...withLines(parsed, path ? fileContents.get(path) : undefined), isComplete };
      const step = findLessonStep(rawChecklists, path);
      if (step) step.lessons.push({ path, lesson });
      else if (openLessons) openLessons.items.push({ path, lesson });
      else {
        openLessons = { kind: 'lessons', key: `l${index}`, items: [{ path, lesson }] };
        blocks.push(openLessons);
      }
    }
  });

  for (const block of blocks) {
    if (block.kind === 'checklist') {
      block.items = resolveChecklist(rawChecklists.get(block.key) ?? [], writtenPaths, isStreaming);
    }
  }

  return blocks.filter((block) => block.kind !== 'checklist' || block.items.length > 0);
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

function ChecklistBlock({ items, onOpen }: { items: ChecklistItem[]; onOpen?: OpenFile }) {
  const doneCount = items.filter((item) => item.status === 'done').length;
  const isRunning = items.some((item) => item.status === 'active');
  const [openItems, setOpenItems] = useState<ReadonlySet<number>>(() => new Set());
  const lessonIndexes = items.flatMap((item, index) => (item.lessons.length > 0 ? [index] : []));
  const isAllOpen = lessonIndexes.length > 0 && lessonIndexes.every((index) => openItems.has(index));
  const idPrefix = useId();

  const toggle = (index: number) =>
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="chat-tile overflow-hidden rounded-xl">
      <div className="chat-tile-head flex h-8 items-center gap-2 px-3 text-xs">
        {isRunning
          ? <OrbitSpinner className="h-3.5 w-3.5" />
          : <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground/90">Build steps</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {lessonIndexes.length > 1 && (
            <button
              type="button"
              onClick={() => setOpenItems(isAllOpen ? new Set() : new Set(lessonIndexes))}
              className="hl-row flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground focus-visible:outline-none"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              {isAllOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
          <span className="tabular-nums text-muted-foreground" aria-label={`${doneCount} of ${items.length} steps done`}>
            {doneCount}/{items.length}
          </span>
        </div>
      </div>
      <ul className="py-1">
        {items.map(({ label, path, status, lessons }, index) => {
          const isOpen = lessons.length > 0 && openItems.has(index);
          const detailsId = `${idPrefix}-lesson-${index}`;
          const fileName = path ? splitPath(path).base : undefined;
          const showFileOnRefs = lessons.length > 1;
          const row = (
            <>
              {status === 'done' ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />
              ) : status === 'active' ? (
                <OrbitSpinner className="h-3.5 w-3.5" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <span
                className={cn(
                  "min-w-0 truncate text-[12px] transition-colors",
                  status === 'done' && "text-muted-foreground",
                  status === 'active' && "text-foreground",
                  status === 'pending' && "text-muted-foreground/75"
                )}
              >
                {label}
              </span>
            </>
          );

          return (
            <li key={`${label}-${index}`}>
              <div className="flex items-center">
                <div className="flex min-h-7 min-w-0 flex-1 items-center gap-2 py-0.5 pl-3 pr-2">
                  {row}
                  {fileName && (
                    <span title={path} className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-muted-foreground">
                      {fileName}
                    </span>
                  )}
                </div>
                {lessons.length > 0 && (
                  <LessonToggle
                    open={isOpen}
                    lesson={lessons[0].lesson}
                    fileName={fileName}
                    fileCount={lessons.length}
                    controls={detailsId}
                    onToggle={() => toggle(index)}
                  />
                )}
              </div>
              {isOpen && (
                <div id={detailsId} className="mb-2 ml-[34px] mr-3 space-y-2">
                  {lessons.map((item, lessonIndex) => (
                    <LessonDetails
                      key={`${item.path ?? "lesson"}-${lessonIndex}`}
                      lesson={item.lesson}
                      path={item.path}
                      showFileOnRefs={showFileOnRefs}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LessonText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`\n]+`)/g).map((part, index) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={index} className="rounded bg-muted px-1 py-px font-mono text-[11px] text-foreground">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={index}>{part.replace(/\*\*/g, "")}</Fragment>
        )
      )}
    </>
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

function LessonDetails({ id, lesson, path, showFileOnRefs, onOpen, className }: {
  id?: string;
  lesson: LessonView;
  path?: string;
  showFileOnRefs?: boolean;
  onOpen?: OpenFile;
  className?: string;
}) {
  const singleConcept = lesson.parts.length === 0 ? lesson.concepts[0] : undefined;

  return (
    <div id={id} className={cn("relative rounded-lg border border-white/[0.1] bg-black/20 py-2.5 pl-4 pr-3 before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[2px] before:rounded-full before:bg-primary/70", className)}>
      {showFileOnRefs && path && (
        <p className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileChip path={path} onOpen={onOpen ? (file) => onOpen(file) : undefined} />
        </p>
      )}

      {(lesson.summary || singleConcept) && (
        <p className="break-words text-[12px] leading-[1.7] text-foreground/90">
          {singleConcept && <><strong className="font-semibold text-primary">{singleConcept}</strong>{" "}</>}
          <LessonText text={lesson.summary} />
        </p>
      )}

      {lesson.parts.length > 0 && (
        <ol className="mt-3 space-y-3.5">
          {lesson.parts.map((part, index) => (
            <li key={index} className="min-w-0">
              {part.code && <CodeReference path={path} part={part} showFile={showFileOnRefs} onOpen={onOpen} />}
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

      {!lesson.isComplete && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <OrbitSpinner className="h-3 w-3" />
          Still writing&hellip;
        </p>
      )}
    </div>
  );
}

function LessonToggle({ open, lesson, fileName, fileCount = 1, controls, onToggle }: {
  open: boolean;
  lesson: LessonView;
  fileName?: string;
  fileCount?: number;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      title={lesson.summary || undefined}
      onClick={onToggle}
      className={cn(
        "hl-row mr-1.5 flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] focus-visible:outline-none",
        open ? "text-primary" : "text-muted-foreground"
      )}
    >
      {lesson.isComplete
        ? <GraduationCap className="h-3.5 w-3.5" />
        : <OrbitSpinner className="h-3.5 w-3.5" />}
      How it works
      {fileCount > 1 && <span className="tabular-nums text-muted-foreground">({fileCount} files)</span>}
      {fileName && <span className="sr-only"> ({fileName})</span>}
      <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
    </button>
  );
}

function LessonsBlock({ items, onOpen }: { items: LessonItem[]; onOpen?: OpenFile }) {
  const [openItems, setOpenItems] = useState<ReadonlySet<number>>(() => new Set());
  const isAllOpen = items.every((_, index) => openItems.has(index));
  const idPrefix = useId();

  const toggle = (index: number) =>
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="chat-tile overflow-hidden rounded-xl">
      <div className="chat-tile-head flex h-8 items-center gap-2 px-3 text-xs">
        <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/90">How it works</span>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setOpenItems(isAllOpen ? new Set() : new Set(items.map((_, index) => index)))}
            className="hl-row -mr-1.5 ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground focus-visible:outline-none"
          >
            {isAllOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      <ul className="py-1">
        {items.map(({ path, lesson }, index) => {
          const isOpen = openItems.has(index);
          const detailsId = `${idPrefix}-lesson-${index}`;
          const { dir, base } = path ? splitPath(path) : { dir: "", base: "" };
          const Icon = path ? getFileIcon(path) : GraduationCap;
          const row = (
            <>
              <Icon className={cn("h-3.5 w-3.5 shrink-0", path ? getFileColor(path) : "text-muted-foreground")} />
              <span className="min-w-0 truncate text-[12px]">
                {path ? (
                  <>
                    <span className="text-muted-foreground">{dir}</span>
                    <span className="text-foreground transition-colors group-hover:text-primary">{base}</span>
                  </>
                ) : (
                  <span className="text-foreground">About this change</span>
                )}
              </span>
            </>
          );

          return (
            <li key={`${path ?? "lesson"}-${index}`}>
              <div className="flex items-center">
                {onOpen && path ? (
                  <button
                    type="button"
                    title={`Open ${path}`}
                    onClick={() => onOpen(path)}
                    className="hl-row group flex h-7 min-w-0 flex-1 items-center gap-2 pl-3 pr-2 text-left focus-visible:outline-none"
                  >
                    {row}
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  </button>
                ) : (
                  <div className="flex h-7 min-w-0 flex-1 items-center gap-2 pl-3 pr-2">{row}</div>
                )}
                <LessonToggle open={isOpen} lesson={lesson} fileName={base || undefined} controls={detailsId} onToggle={() => toggle(index)} />
              </div>
              {isOpen && (
                <LessonDetails id={detailsId} lesson={lesson} path={path} onOpen={onOpen} className="mb-2 ml-[34px] mr-3" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditsBlock({ items, onOpen }: { items: EditItem[]; onOpen?: OpenFile }) {
  const isActive = items.some((item) => item.active);
  const count = `${items.length} ${items.length === 1 ? "file" : "files"}`;

  return (
    <div className="chat-tile overflow-hidden rounded-xl">
      <div className="chat-tile-head flex h-8 items-center gap-2 px-3 text-xs">
        {isActive
          ? <OrbitSpinner className="h-3.5 w-3.5" />
          : <FilePen className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground/90">
          {items.some((item) => item.deleted) ? (isActive ? "Changing" : "Changed") : isActive ? "Editing" : "Edited"} {count}
        </span>
      </div>
      <ul className="py-1">
        {items.map(({ path, active, deleted }, index) => {
          const Icon = getFileIcon(path);
          const { dir, base } = splitPath(path);
          const row = (
            <>
              {active
                ? <OrbitSpinner className="h-3.5 w-3.5" />
                : deleted
                  ? <Trash2 className="h-3.5 w-3.5 shrink-0 text-destructive/80" />
                  : <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />}
              <Icon className={cn("h-3.5 w-3.5 shrink-0", getFileColor(path), deleted && "opacity-50")} />
              <span className={cn("min-w-0 truncate text-[12px]", deleted && "line-through decoration-muted-foreground/60")}>
                <span className="text-muted-foreground">{dir}</span>
                <span className={cn("transition-colors group-hover:text-primary", deleted ? "text-muted-foreground" : "text-foreground")}>{base}</span>
              </span>
              {deleted && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">Deleted</span>}
            </>
          );

          return (
            <li key={`${path}-${index}`}>
              {onOpen && !deleted ? (
                <button
                  type="button"
                  title={`Open ${path}`}
                  onClick={() => onOpen(path)}
                  className="hl-row group flex h-7 w-full min-w-0 items-center gap-2 pl-3 pr-2 text-left focus-visible:outline-none"
                >
                  {row}
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ) : (
                <div className="flex h-7 min-w-0 items-center gap-2 pl-3 pr-2">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface AssistantEventsProps {
  events: ChatEvent[];
  isStreaming: boolean;
  isIdle: boolean;
  fallbackThought?: string;
  onOpenFile?: OpenFile;
  onAnswer?: (answer: string) => void;
}

export function AssistantEvents({ events, isStreaming, isIdle, fallbackThought, onOpenFile, onAnswer }: AssistantEventsProps) {
  const thought = events.find((event) => event.type === ChatEventType.THOUGHT)?.content ?? fallbackThought;
  const blocks = buildBlocks(events, isStreaming);

  const lastEvent = events[events.length - 1];
  const lastBlock = blocks[blocks.length - 1];
  const hasStreamingLesson = blocks.some(
    (block) =>
      (block.kind === 'checklist' && block.items.some((item) => item.lessons.some((one) => !one.lesson.isComplete))) ||
      (block.kind === 'lessons' && block.items.some((item) => !item.lesson.isComplete))
  );
  const hasBusyBlock =
    (lastBlock?.kind === 'reads' && lastBlock.active) ||
    (lastBlock?.kind === 'edits' && lastBlock.items.some((item) => item.active)) ||
    hasStreamingLesson;
  const isTyping = lastEvent?.type === ChatEventType.MESSAGE && lastEvent.isComplete === false;
  const showWorking = isStreaming && !hasBusyBlock && !isTyping && (events.length === 0 || isIdle);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HorizonMark className="h-5 w-5" title="Singularity" />
        {thought && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {thought}
          </span>
        )}
      </div>

      {blocks.map((block) => {
        switch (block.kind) {
          case 'message':
            return (
              <ChatMarkdown key={block.key}>{block.content}</ChatMarkdown>
            );
          case 'reads':
            return <ReadsBlock key={block.key} files={block.files} active={block.active} onOpen={onOpenFile} />;
          case 'checklist':
            return <ChecklistBlock key={block.key} items={block.items} onOpen={onOpenFile} />;
          case 'edits':
            return <EditsBlock key={block.key} items={block.items} onOpen={onOpenFile} />;
          case 'lessons':
            return <LessonsBlock key={block.key} items={block.items} onOpen={onOpenFile} />;
          case 'ask':
            return <AskBlock key={block.key} questions={block.questions} onAnswer={isStreaming ? undefined : onAnswer} />;
        }
      })}

      {showWorking && (
        <div className="flex h-6 items-center gap-2 text-xs">
          <OrbitSpinner className="h-3.5 w-3.5" />
          <span className="text-shimmer font-medium">{events.length === 0 ? "Thinking" : "Working"}&hellip;</span>
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
