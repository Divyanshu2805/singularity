/**
 * A short interview before a project is created, asking only about what this particular idea leaves open.
 *
 * Handles: asking for the questions, collecting or skipping each answer, compiling them into a brief, going straight
 * to building when the AI judges the idea needs no questions, saying so plainly when the AI could not be reached and
 * the questions shown are the general set rather than ones written for the idea, and handing a spent allowance to the
 * quota dialog rather than showing an error.
 *
 * The number of questions is the AI's decision, from none to five. The general set below is only ever a fallback, and
 * is never shown without the notice: it was once shown silently, which made a broken AI connection look like an
 * interview that always asked the same four things.
 *
 * The answers are compiled so the first prompt the AI sees is a clear spec instead of a one-liner.
 *
 * Nothing about the interview lives in this component: the questions, the answers and the position are in
 * lib/idea-interview, and its two AI requests run there to completion. Leaving the page and coming back therefore
 * finds the interview where it was, instead of an empty prompt. This component draws that state and reports the
 * outcome (build with this message, or a spent allowance) to the page when there is one, including one that arrived
 * while the page was away.
 *
 * It draws no card of its own: the dashboard puts it on the glass card that the project's set-up progress then takes
 * over (pages/ProjectsDashboard.tsx), so the two are one card changing its contents and easing to each new height,
 * not one card leaving and another arriving. Each question rises in, a chosen answer takes the app's
 * selected look - a faint gold glass fill inside a gold hairline (.row-active) and a filled number badge - and the step bar fills
 * in gold as the questions are answered.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Check, PenLine, Plus, Sparkles } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Button } from "@/components/ui/button";
import {
  addCustomOption,
  advance as advanceInterview,
  answersOf,
  compileInterview,
  goBack as goBackInterview,
  goToQuestion as goToInterviewQuestion,
  setSelection,
  useInterview,
} from "@/lib/idea-interview";
import type { QuotaDetails } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUTO_ADVANCE_MS = 260;

interface IdeaClarifierProps {
  onEditIdea: () => void;
  onComplete: (firstMessage: string) => void;
  onQuotaExceeded?: (quota: QuotaDetails) => void;
}

export function IdeaClarifier({ onEditIdea, onComplete, onQuotaExceeded }: IdeaClarifierProps) {
  const interview = useInterview();
  const [isWritingOwn, setIsWritingOwn] = useState(false);
  const [ownAnswer, setOwnAnswer] = useState("");
  const advanceTimerRef = useRef<number | undefined>(undefined);

  const onQuotaExceededRef = useRef(onQuotaExceeded);
  onQuotaExceededRef.current = onQuotaExceeded;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const outcome = interview?.outcome ?? null;
  useEffect(() => {
    if (!outcome) return;
    if (outcome.kind === "build") onCompleteRef.current(outcome.firstMessage);
    else onQuotaExceededRef.current?.(outcome.quota);
  }, [outcome]);

  useEffect(() => () => window.clearTimeout(advanceTimerRef.current), []);

  const idea = interview?.idea ?? "";
  const questions = interview?.questions ?? [];
  const isTailored = interview?.isTailored ?? true;
  const index = interview?.index ?? 0;
  const phase = !interview || interview.isLoading ? "loading" : interview.phase;
  const selections = interview?.selections ?? {};
  const customOptions = interview?.customOptions ?? {};

  const question = questions[index];
  const options = question ? [...question.options, ...(customOptions[question.id] ?? [])] : [];
  const selected = question ? selections[question.id] ?? [] : [];

  const answers = interview ? answersOf(interview) : [];
  const answeredCount = answers.filter((answer) => answer.answers.length > 0).length;

  const settle = () => {
    window.clearTimeout(advanceTimerRef.current);
    setIsWritingOwn(false);
    setOwnAnswer("");
  };

  const goToQuestion = (target: number, { fromReview = false } = {}) => {
    settle();
    goToInterviewQuestion(target, fromReview);
  };

  const next = () => {
    settle();
    advanceInterview();
  };

  const back = () => {
    settle();
    goBackInterview();
  };

  const choose = (option: string) => {
    if (!question) return;
    const current = selections[question.id] ?? [];
    const isSelected = current.includes(option);
    const nextSelection = question.multiSelect
      ? isSelected
        ? current.filter((value) => value !== option)
        : [...current, option]
      : isSelected
        ? []
        : [option];
    setSelection(question.id, nextSelection);

    window.clearTimeout(advanceTimerRef.current);
    if (!question.multiSelect && !isSelected) {
      advanceTimerRef.current = window.setTimeout(next, AUTO_ADVANCE_MS);
    }
  };

  const addOwnAnswer = (e: FormEvent) => {
    e.preventDefault();
    const text = ownAnswer.trim();
    if (!question || !text) return;
    if (!options.includes(text)) addCustomOption(question.id, text);
    setIsWritingOwn(false);
    setOwnAnswer("");
    if (!selected.includes(text)) choose(text);
  };

  const build = () => compileInterview();

  const keyboardRef = useRef({ phase, options, choose, next });
  keyboardRef.current = { phase, options, choose, next };
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const current = keyboardRef.current;
      if (current.phase !== "asking" || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (/^[1-9]$/.test(e.key)) {
        const option = current.options[Number(e.key) - 1];
        if (option) {
          e.preventDefault();
          current.choose(option);
        }
      } else if (e.key === "Enter" && !target?.closest("button")) {
        e.preventDefault();
        current.next();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!interview) return null;

  const stepCount = questions.length + 1;
  const currentStep = phase === "review" || phase === "compiling" ? questions.length : index;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={idea}>
          &ldquo;<span className="text-foreground/90">{idea}</span>&rdquo;
        </p>
        <button
          type="button"
          onClick={onEditIdea}
          disabled={phase === "compiling"}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <PenLine className="h-3 w-3" />
          Edit idea
        </button>
      </div>

      <div className="px-5 pb-5 pt-4">
        {phase === "loading" ? (
          <div role="status" className="flex flex-col items-center gap-2 py-10 text-center">
            <OrbitSpinner className="h-7 w-7" />
            <p className="text-shimmer mt-2 text-sm">Reading your idea…</p>
            <p className="text-xs text-muted-foreground">You'll only be asked what it leaves open, and you can skip any of it.</p>
          </div>
        ) : (
          <>
            {!isTailored && (
              <p role="status" className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-xs text-foreground/90">
                The AI couldn&rsquo;t be reached just now, so these are general questions rather than ones written for your idea. You can answer them, skip them, or try again in a moment.
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {phase === "asking" ? `Question ${index + 1} of ${questions.length}` : "Review"}
              </span>
              {phase === "asking" && (
                <button
                  type="button"
                  onClick={() => onComplete(idea)}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Skip questions
                </button>
              )}
            </div>
            <div aria-hidden="true" className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))` }}>
              {Array.from({ length: stepCount }, (_, step) => (
                <span
                  key={step}
                  className={cn(
                    "h-1 rounded-full transition-[background-color,box-shadow] duration-500",
                    step < currentStep
                      ? "bg-primary/60"
                      : step === currentStep
                        ? "bg-primary"
                        : "bg-white/[0.08]"
                  )}
                />
              ))}
            </div>

            {phase === "asking" && question ? (
              <div key={question.id} className="chat-enter">
                <h2 className="mt-5 font-display text-[22px] font-semibold leading-tight tracking-tight text-foreground">{question.question}</h2>
                {question.helper && <p className="mt-1 text-sm text-muted-foreground">{question.helper}</p>}

                <div role="group" aria-label={question.question} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {options.map((option, optionIndex) => {
                    const isSelected = selected.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => choose(option)}
                        aria-pressed={isSelected}
                        className={cn(
                          "flex min-h-10 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-[border-color,background-color,color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isSelected
                            ? "row-active border-transparent pl-4 text-foreground"
                            : "border-white/[0.07] bg-black/20 text-foreground/90 hover:border-primary/40 hover:bg-primary/[0.06] hover:text-foreground"
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium transition-colors",
                            isSelected
                              ? "border-transparent bg-primary text-primary-foreground"
                              : "border-white/10 text-muted-foreground"
                          )}
                        >
                          {isSelected ? <Check className="h-3 w-3" /> : optionIndex < 9 ? optionIndex + 1 : ""}
                        </span>
                        <span className="min-w-0 flex-1">{option}</span>
                      </button>
                    );
                  })}

                  {isWritingOwn ? (
                    <form
                      onSubmit={addOwnAnswer}
                      className="app-field flex min-h-10 items-center gap-2 rounded-xl pl-3 pr-1.5 sm:col-span-2"
                    >
                      <span aria-hidden="true" className="select-none font-semibold text-primary">›</span>
                      <input
                        autoFocus
                        value={ownAnswer}
                        maxLength={120}
                        onChange={(e) => setOwnAnswer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setIsWritingOwn(false);
                            setOwnAnswer("");
                          }
                        }}
                        placeholder="Type your own answer"
                        aria-label="Your own answer"
                        className="min-w-0 flex-1 bg-transparent text-sm text-foreground caret-primary outline-none placeholder:text-muted-foreground/70"
                      />
                      <Button type="submit" size="sm" disabled={!ownAnswer.trim()} className="h-7 px-2.5 text-xs">
                        Add
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsWritingOwn(true)}
                      className="flex min-h-10 items-center gap-2.5 rounded-xl border border-dashed border-white/10 px-3 py-2 text-left text-sm text-muted-foreground transition-colors duration-300 hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      Something else
                    </button>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={back} disabled={index === 0} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
                    <ArrowLeft />
                    Back
                  </Button>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">
                      {question.multiSelect ? "Pick as many as you like · Enter to continue" : `Press 1–${Math.min(options.length, 9)} to choose`}
                    </span>
                    <button type="button" onClick={next} className="app-send h-8 gap-1.5 px-3.5 text-xs font-medium">
                      {selected.length > 0 ? "Continue" : "Skip"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="chat-enter">
                <h2 className="mt-5 font-display text-[22px] font-semibold leading-tight tracking-tight text-foreground">Here&rsquo;s the plan</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {answeredCount > 0
                    ? "Singularity will turn this into a project brief and start building."
                    : "You skipped the questions, so Singularity will make sensible choices for you."}
                </p>

                <dl className="mt-4 divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
                  {answers.map((answer, answerIndex) => (
                    <div key={answer.questionId} className="group flex items-start gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <dt className="text-xs text-muted-foreground">{answer.question}</dt>
                        <dd className={cn("mt-0.5 text-sm", answer.answers.length > 0 ? "text-foreground" : "italic text-muted-foreground/80")}>
                          {answer.answers.length > 0 ? answer.answers.join(", ") : "Skipped - Singularity will decide"}
                        </dd>
                      </div>
                      <button
                        type="button"
                        onClick={() => goToQuestion(answerIndex, { fromReview: true })}
                        disabled={phase === "compiling"}
                        className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={back} disabled={phase === "compiling"} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
                    <ArrowLeft />
                    Back
                  </Button>
                  <button type="button" onClick={build} disabled={phase === "compiling"} className="app-send h-9 gap-2 px-4 text-sm font-medium">
                    {phase === "compiling" ? (
                      <>
                        <OrbitSpinner className="h-4 w-4" />
                        Writing your brief…
                      </>
                    ) : (
                      <>
                        Build it
                        <ArrowUp className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
