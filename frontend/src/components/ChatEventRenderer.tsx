import { Fragment, useId, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Circle, CircleAlert, Clock, FilePen, FileSearch, GraduationCap, ListChecks, Loader2, Trash2 } from 'lucide-react';
import { LogoMark } from '@/components/VibeCraftLogo';
import { ChatMarkdown } from '@/components/ChatMarkdown';
import { ChatEvent, ChatEventType } from '@/lib/types';
import { getFileColor, getFileIcon, splitPath } from '@/lib/file-icons';
import { type CodeTarget, type Lesson, type LessonPart, parseLesson, withLines } from '@/lib/lesson';
import { cn } from '@/lib/utils';

type OpenFile = (path: string, target?: CodeTarget) => void;

/**
 * A build step, with the walkthroughs of what that step did folded underneath it. A step usually writes one
 * file, but may write two or three that only make sense together - then it carries one walkthrough per file.
 */
type ChecklistItem = { label: string; path?: string; status: 'done' | 'active' | 'pending'; lessons: LessonItem[] };

/** A checklist step before its status is resolved - built as the events arrive, so lessons can be hung on it. */
type RawStep = { label: string; path?: string; lessons: LessonItem[] };

/**
 * Backstop on a runaway checklist, matching LlmResponseParser.MAX_CHECKLIST_STEPS so the live view shows
 * exactly what gets saved. The real length is set by the work - the model is told to emit one step per file
 * it writes - so this only bites when it ignores that.
 */
const MAX_CHECKLIST_STEPS = 12;

/** Teaching mode's walkthrough of one file, and whether it has finished arriving. */
type LessonView = Lesson & { isComplete: boolean };
type EditItem = { path: string; active: boolean; deleted?: boolean };
type LessonItem = { path?: string; lesson: LessonView };

type Block =
  | { kind: 'message'; key: string; content: string }
  | { kind: 'reads'; key: string; files: string[]; active: boolean }
  | { kind: 'checklist'; key: string; items: ChecklistItem[] }
  | { kind: 'edits'; key: string; items: EditItem[] }
  // Only for walkthroughs with no build step to sit under - normally they live on their step's row.
  | { kind: 'lessons'; key: string; items: LessonItem[] };

// A half-revealed "**bold" or "`code" would render its opening marker literally until the closer arrives.
function tidyPartialMarkdown(text: string) {
  let tidy = text;
  if ((tidy.match(/\*\*/g)?.length ?? 0) % 2 === 1) tidy = tidy.replace(/\*\*(?!.*\*\*)/s, "");
  if (!tidy.includes("```") && (tidy.match(/`/g)?.length ?? 0) % 2 === 1) tidy = tidy.replace(/`(?!.*`)/s, "");
  return tidy;
}

/**
 * Which checklist steps are done. A step is done when the file it named has finished being written; a step
 * that named no file is carried by the ones around it, since the model works through them in order - you
 * can't be on step four if step two hasn't happened. Once the response is over, a step whose file never
 * arrived stays unticked on purpose: that's the honest record of a plan the model didn't finish.
 */
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
    // Nothing more is coming, so a step with no file of its own can't be waiting on anything.
    items.forEach((item, i) => { if (!item.path) done[i] = true; });
  }
  const activeIndex = isStreaming ? done.indexOf(false) : -1;

  return items.map((item, i) => ({
    ...item,
    status: done[i] ? 'done' : i === activeIndex ? 'active' : 'pending',
  }));
}

/**
 * The build step a walkthrough belongs under. That's where a learner reads it - beside the sentence saying what
 * the step set out to do - rather than in the list of files that were touched.
 *
 * <p>First choice is the step that named this exact file. A step that writes more than one file can only name
 * one of them, so a walkthrough for an unclaimed file joins the step currently being explained - the last one
 * that has taken a walkthrough, since the model works through its steps in order. Failing both, it gets its
 * own card.
 */
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

// Consecutive reads collapse into one row, consecutive todos into one checklist, and consecutive edits
// into one card, so a five-file change reads as a single step instead of five near-identical lines.
// Exported for tests: the checklist's done/active/pending resolution is the part worth pinning.
export function buildBlocks(events: ChatEvent[], isStreaming: boolean): Block[] {
  const blocks: Block[] = [];
  const lastIndex = events.length - 1;
  const lessonPaths = new Set<string>();

  // Collected up front: the checklist is emitted before any file is written, so it has to be able to look
  // ahead at edits that arrive after it.
  const writtenPaths = new Set(
    events
      // A deleted file ticks off its step too - removing the old copy is how a rename finishes.
      .filter((event) => (event.type === ChatEventType.FILE_EDIT || event.type === ChatEventType.FILE_DELETE)
        && event.filePath && event.isComplete !== false)
      .map((event) => event.filePath as string)
  );
  // What each file looked like in this turn, for finding the lines a walkthrough quotes.
  const fileContents = new Map(
    events
      .filter((event) => event.type === ChatEventType.FILE_EDIT && event.filePath)
      .map((event) => [event.filePath as string, event.content])
  );
  const rawChecklists = new Map<string, RawStep[]>();
  // Edits and walkthroughs are tracked by hand rather than by looking at the previous block, because a
  // walkthrough lands between two files: the file after it still belongs in the same "Edited N files" card.
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
      // One lesson per file, as LlmResponseParser saves them - a repeat shown live would vanish on refresh.
      if (event.filePath && lessonPaths.has(event.filePath)) return;
      if (event.filePath) lessonPaths.add(event.filePath);

      const isComplete = event.isComplete !== false;
      const parsed = parseLesson(event.content, event.metadata || undefined, isComplete);
      // Only the prose is tidied mid-stream - a quoted line of code keeps every backtick it really has.
      if (!isComplete) {
        parsed.summary = tidyPartialMarkdown(parsed.summary);
        parsed.parts = parsed.parts.map((part) => ({ ...part, text: tidyPartialMarkdown(part.text) }));
      }
      // A walkthrough that named no file - or one this turn never wrote - is about the file just written, since
      // the model writes each walkthrough straight after its file.
      const path = event.filePath && fileContents.has(event.filePath) ? event.filePath : lastWrittenPath ?? event.filePath;
      const lesson = { ...withLines(parsed, path ? fileContents.get(path) : undefined), isComplete };
      const step = findLessonStep(rawChecklists, path);
      // Attaching to a step pushes no block, so the edits card is left as a plain list of what changed.
      if (step) step.lessons.push({ path, lesson });
      else if (openLessons) openLessons.items.push({ path, lesson });
      else {
        openLessons = { kind: 'lessons', key: `l${index}`, items: [{ path, lesson }] };
        blocks.push(openLessons);
      }
    }
  });

  // Resolved last, so every checklist sees every edit in the turn regardless of ordering.
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
    "inline-flex h-6 max-w-[220px] items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 text-[11.5px] text-foreground/85 transition-colors";
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
      className={cn(className, "hover:border-primary/50 hover:bg-primary/10 hover:text-primary")}
    >
      {content}
    </button>
  );
}

function ReadsBlock({ files, active, onOpen }: { files: string[]; active: boolean; onOpen?: (path: string) => void }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="flex h-6 shrink-0 items-center gap-1.5">
        {active ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <FileSearch className="h-3.5 w-3.5" />}
        {active ? "Reading" : "Read"}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {files.map((file) => <FileChip key={file} path={file} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function ChecklistBlock({ items, onOpen }: { items: ChecklistItem[]; onOpen?: OpenFile }) {
  const doneCount = items.filter((item) => item.status === 'done').length;
  const isRunning = items.some((item) => item.status === 'active');
  // Every walkthrough starts folded: the learner opens only the steps they want to read about.
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
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/60">
      <div className="flex h-8 items-center gap-2 border-b border-border/60 px-3 text-xs">
        {isRunning
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          : <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="font-medium text-foreground/90">Build steps</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {lessonIndexes.length > 1 && (
            <button
              type="button"
              onClick={() => setOpenItems(isAllOpen ? new Set() : new Set(lessonIndexes))}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
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
          // With more than one file under a step, every quoted line has to say which file it is from.
          const showFileOnRefs = lessons.length > 1;
          const row = (
            <>
              {status === 'done' ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-syntax-string" />
              ) : status === 'active' ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              )}
              <span
                className={cn(
                  "min-w-0 truncate text-[12px] transition-colors",
                  status === 'done' && "text-muted-foreground",
                  status === 'active' && "text-foreground",
                  status === 'pending' && "text-muted-foreground/70"
                )}
              >
                {label}
              </span>
            </>
          );

          return (
            <li key={`${label}-${index}`}>
              {/* The step itself doesn't open a file: its walkthrough's quoted lines are the way into the code,
                  and they point at the exact line being explained rather than the top of the file. */}
              <div className="flex items-center">
                <div className="flex min-h-7 min-w-0 flex-1 items-center gap-2 py-0.5 pl-3 pr-2">
                  {row}
                  {/* Which file this step is about. Plain text, not a link: opening it here would land at the
                      top of the file, while the walkthrough's quoted lines land on the code being explained. */}
                  {fileName && (
                    <span title={path} className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-muted-foreground/80">
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
              {/* Indented to line up under the step's own text, so it reads as belonging to this step. */}
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

/** Walkthrough prose is plain sentences, so backticked code names are the only formatting worth honouring. */
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

/**
 * A quoted line of code: where it lives and what it says, jumping to that line in the editor when clicked.
 * `showFile` names the file alongside the line number - needed whenever the surrounding step covers more than
 * one file, since the line number alone wouldn't say which.
 */
function CodeReference({ path, part, showFile, onOpen }: {
  path?: string;
  part: LessonPart;
  showFile?: boolean;
  onOpen?: OpenFile;
}) {
  const className =
    "flex min-w-0 max-w-full items-center gap-2 rounded border border-border/60 bg-panel px-1.5 py-0.5 text-left font-mono text-[11px]";
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
      className={cn(className, "transition-colors hover:border-primary/50 hover:bg-primary/10")}
    >
      {content}
    </button>
  );
}

function LessonDetails({ id, lesson, path, showFileOnRefs, onOpen, className }: {
  id?: string;
  lesson: LessonView;
  path?: string;
  /** Put the file name on every quoted line - for a step whose walkthroughs span more than one file. */
  showFileOnRefs?: boolean;
  onOpen?: OpenFile;
  className?: string;
}) {
  // A one-sentence lesson from before walkthroughs existed has no parts, just its concept and sentence.
  const legacyConcept = lesson.parts.length === 0 ? lesson.concepts[0] : undefined;

  return (
    <div id={id} className={cn("rounded-md border border-l-2 border-border/60 border-l-primary/60 bg-muted/20 px-3 py-2.5", className)}>
      {showFileOnRefs && path && (
        <p className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileChip path={path} onOpen={onOpen ? (file) => onOpen(file) : undefined} />
        </p>
      )}

      {(lesson.summary || legacyConcept) && (
        <p className="break-words text-[12px] leading-[1.7] text-foreground/90">
          {/* A real space, not just margin, so screen readers and copied text don't run the label into the sentence. */}
          {legacyConcept && <><strong className="font-semibold text-primary">{legacyConcept}</strong>{" "}</>}
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
                    <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 align-middle text-[10.5px] font-medium text-primary">
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
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
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
  /** How many files this toggle opens - shown when a step wrote more than one. */
  fileCount?: number;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      // The summary on hover, so a folded walkthrough still says what's inside before it's opened.
      title={lesson.summary || undefined}
      onClick={onToggle}
      className={cn(
        "mr-1.5 flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
        open ? "text-primary" : "text-muted-foreground"
      )}
    >
      {lesson.isComplete
        ? <GraduationCap className="h-3.5 w-3.5" />
        : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
      How it works
      {fileCount > 1 && <span className="tabular-nums text-muted-foreground">({fileCount} files)</span>}
      {fileName && <span className="sr-only"> ({fileName})</span>}
      <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
    </button>
  );
}

/**
 * Walkthroughs with no build step to sit under - a turn that wrote files without listing steps first, or one
 * explaining something it never wrote. Shown together in their own card, folded like the rest.
 */
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
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/60">
      <div className="flex h-8 items-center gap-2 border-b border-border/60 px-3 text-xs">
        <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/90">How it works</span>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setOpenItems(isAllOpen ? new Set() : new Set(items.map((_, index) => index)))}
            className="-mr-1.5 ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
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
                    className="group flex h-7 min-w-0 flex-1 items-center gap-2 pl-3 pr-2 text-left transition-colors hover:bg-primary/10"
                  >
                    {row}
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary" />
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
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/60">
      <div className="flex h-8 items-center gap-2 border-b border-border/60 px-3 text-xs">
        {isActive
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
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
                ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
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
              {/* A deleted file has nothing left to open. */}
              {onOpen && !deleted ? (
                <button
                  type="button"
                  title={`Open ${path}`}
                  onClick={() => onOpen(path)}
                  className="group flex h-7 w-full min-w-0 items-center gap-2 pl-3 pr-2 text-left transition-colors hover:bg-primary/10"
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
  /** True once nothing new has arrived for a moment - used to surface "Working..." between steps. */
  isIdle: boolean;
  /**
   * How long the turn took, for a response that just finished. The server writes a `THOUGHT` event, but only
   * when it saves the turn afterwards - without this the time appeared out of nowhere on the next refresh.
   */
  fallbackThought?: string;
  /** `target` is set when a walkthrough points at a particular line of the file. */
  onOpenFile?: OpenFile;
}

export function AssistantEvents({ events, isStreaming, isIdle, fallbackThought, onOpenFile }: AssistantEventsProps) {
  const thought = events.find((event) => event.type === ChatEventType.THOUGHT)?.content ?? fallbackThought;
  const blocks = buildBlocks(events, isStreaming);

  const lastEvent = events[events.length - 1];
  const lastBlock = blocks[blocks.length - 1];
  // A walkthrough is written after its file but shown up in the checklist, so it isn't the last block while it
  // streams - without this the turn would look idle and print "Working..." over a card that's still filling in.
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
        <LogoMark className="h-5 w-5" title="VibeCraft" />
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
        }
      })}

      {showWorking && (
        <div className="flex h-6 items-center gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-shimmer font-medium">{events.length === 0 ? "Thinking" : "Working"}&hellip;</span>
        </div>
      )}
    </div>
  );
}

export function AssistantError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">This response didn&rsquo;t finish</p>
        <p className="mt-0.5 break-words text-muted-foreground">{message} &mdash; try sending your request again.</p>
      </div>
    </div>
  );
}
