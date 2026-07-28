/**
 * A short interview before a project is created - who it is for, the core action, must-have screens and a style -
 * with options tailored to the idea.
 *
 * Handles: asking for the questions, collecting or skipping each answer, compiling them into a brief, and handing a
 * spent allowance to the quota dialog rather than showing an error.
 *
 * The answers are compiled so the first prompt the AI sees is a clear spec instead of a one-liner.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Check, Loader2, PenLine, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, isQuotaError } from "@/lib/api";
import type { ClarifyingQuestion, IdeaAnswer, QuotaDetails } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "loading" | "asking" | "review" | "compiling";

const LOCAL_QUESTIONS: ClarifyingQuestion[] = [
  {
    id: "audience",
    question: "Who is this for?",
    helper: "Knowing your users shapes every screen.",
    options: ["Just me", "My customers", "My team at work", "Students or learners", "The general public"],
    multiSelect: false,
  },
  {
    id: "core_action",
    question: "What's the one thing people must be able to do?",
    helper: "Everything else gets built around this.",
    options: ["Create and manage items", "Browse and search content", "Track progress over time", "Book or buy something", "Share with others"],
    multiSelect: false,
  },
  {
    id: "screens",
    question: "Which screens does it need?",
    helper: "Pick any that apply. You can always add more later.",
    options: ["Landing page", "Dashboard", "List or feed", "Detail page", "Settings", "Sign in"],
    multiSelect: true,
  },
  {
    id: "style",
    question: "What should it feel like?",
    helper: "A style reference helps the design land the first time.",
    options: ["Clean and minimal", "Bold and colorful", "Dark and techy", "Playful and friendly", "Like Notion", "Like Stripe"],
    multiSelect: false,
  },
];

const AUTO_ADVANCE_MS = 260;

function localBrief(idea: string, answers: IdeaAnswer[]) {
  const answered = answers.filter((answer) => answer.answers.length > 0);
  const details = answered
    .map((answer) => `\n- ${answer.question.trim().replace(/[?:\s]+$/, "")}: ${answer.answers.join(", ")}`)
    .join("");
  return `**Build:** ${idea}${details ? `\n\n**Details:**${details}` : ""}`;
}

interface IdeaClarifierProps {
  idea: string;
  onEditIdea: () => void;
  onComplete: (firstMessage: string) => void;
  onQuotaExceeded?: (quota: QuotaDetails) => void;
}

export function IdeaClarifier({ idea, onEditIdea, onComplete, onQuotaExceeded }: IdeaClarifierProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [customOptions, setCustomOptions] = useState<Record<string, string[]>>({});
  const [isWritingOwn, setIsWritingOwn] = useState(false);
  const [ownAnswer, setOwnAnswer] = useState("");
  const advanceTimerRef = useRef<number | undefined>(undefined);
  const returnToReviewRef = useRef(false);

  const onQuotaExceededRef = useRef(onQuotaExceeded);
  onQuotaExceededRef.current = onQuotaExceeded;

  useEffect(() => {
    let isCancelled = false;
    api.clarifyIdea(idea)
      .then((generated) => {
        if (isCancelled) return;
        setQuestions(generated.length > 0 ? generated : LOCAL_QUESTIONS);
        setPhase("asking");
      })
      .catch((error) => {
        if (isCancelled) return;
        if (isQuotaError(error) && error.quota && onQuotaExceededRef.current) {
          onQuotaExceededRef.current(error.quota);
          return;
        }
        console.warn("Couldn't get tailored questions, using general ones", error);
        setQuestions(LOCAL_QUESTIONS);
        setPhase("asking");
      });
    return () => {
      isCancelled = true;
    };
  }, [idea]);

  useEffect(() => () => window.clearTimeout(advanceTimerRef.current), []);

  const question = questions[index];
  const options = question ? [...question.options, ...(customOptions[question.id] ?? [])] : [];
  const selected = question ? selections[question.id] ?? [] : [];

  const answers: IdeaAnswer[] = questions.map((q) => ({ questionId: q.id, question: q.question, answers: selections[q.id] ?? [] }));
  const answeredCount = answers.filter((answer) => answer.answers.length > 0).length;

  const goToQuestion = (target: number, { fromReview = false } = {}) => {
    window.clearTimeout(advanceTimerRef.current);
    returnToReviewRef.current = fromReview;
    setIsWritingOwn(false);
    setOwnAnswer("");
    setIndex(target);
    setPhase("asking");
  };

  const next = () => {
    window.clearTimeout(advanceTimerRef.current);
    setIsWritingOwn(false);
    setOwnAnswer("");
    if (returnToReviewRef.current || index >= questions.length - 1) {
      returnToReviewRef.current = false;
      setPhase("review");
      return;
    }
    setIndex(index + 1);
  };

  const back = () => {
    if (phase === "review") {
      goToQuestion(questions.length - 1);
      return;
    }
    if (index > 0) goToQuestion(index - 1);
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
    setSelections((prev) => ({ ...prev, [question.id]: nextSelection }));

    window.clearTimeout(advanceTimerRef.current);
    if (!question.multiSelect && !isSelected) {
      advanceTimerRef.current = window.setTimeout(next, AUTO_ADVANCE_MS);
    }
  };

  const addOwnAnswer = (e: FormEvent) => {
    e.preventDefault();
    const text = ownAnswer.trim();
    if (!question || !text) return;
    if (!options.includes(text)) {
      setCustomOptions((prev) => ({ ...prev, [question.id]: [...(prev[question.id] ?? []), text] }));
    }
    setIsWritingOwn(false);
    setOwnAnswer("");
    if (!selected.includes(text)) choose(text);
  };

  const build = async () => {
    setPhase("compiling");
    try {
      onComplete(await api.compileIdea(idea, answers));
    } catch (error) {
      if (isQuotaError(error) && error.quota && onQuotaExceeded) {
        onQuotaExceeded(error.quota);
        return;
      }
      console.warn("Couldn't compile the brief on the server, using a simple one", error);
      onComplete(localBrief(idea, answers));
    }
  };

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

  const stepCount = questions.length + 1;
  const currentStep = phase === "review" || phase === "compiling" ? questions.length : index;

  return (
    <div className="mt-7 w-full overflow-hidden rounded-3xl border border-border/80 bg-card/90 text-left shadow-2xl shadow-black/40 backdrop-blur animate-in fade-in-0 zoom-in-95 duration-200">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
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
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-shimmer mt-1 text-sm">Tailoring a few questions to your idea…</p>
            <p className="text-xs text-muted-foreground">Only what's needed, and you can skip any of them.</p>
          </div>
        ) : (
          <>
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
                    "h-1 rounded-full transition-colors duration-300",
                    step < currentStep ? "bg-primary/70" : step === currentStep ? "bg-primary" : "bg-border/80"
                  )}
                />
              ))}
            </div>

            {phase === "asking" && question ? (
              <div key={question.id} className="animate-fade-in">
                <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">{question.question}</h2>
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
                          "flex min-h-10 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isSelected
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border/80 bg-background/40 text-foreground/90 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium transition-colors",
                            isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
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
                      className="flex min-h-10 items-center gap-2 rounded-xl border border-primary/50 bg-background/60 pl-3 pr-1.5 ring-[3px] ring-primary/10 sm:col-span-2"
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
                      className="flex min-h-10 items-center gap-2.5 rounded-xl border border-dashed border-border/80 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <Button size="sm" onClick={next} className="h-8 gap-1.5 text-xs [&_svg]:size-3.5">
                      {selected.length > 0 ? "Continue" : "Skip"}
                      <ArrowRight />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Here&rsquo;s the plan</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {answeredCount > 0
                    ? "VibeCraft will turn this into a project brief and start building."
                    : "You skipped the questions, so VibeCraft will make sensible choices for you."}
                </p>

                <dl className="mt-4 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-background/40">
                  {answers.map((answer, answerIndex) => (
                    <div key={answer.questionId} className="group flex items-start gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <dt className="text-xs text-muted-foreground">{answer.question}</dt>
                        <dd className={cn("mt-0.5 text-sm", answer.answers.length > 0 ? "text-foreground" : "italic text-muted-foreground/80")}>
                          {answer.answers.length > 0 ? answer.answers.join(", ") : "Skipped - VibeCraft will decide"}
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
                  <Button size="sm" onClick={build} disabled={phase === "compiling"} className="h-9 gap-2 px-4 text-sm [&_svg]:size-4">
                    {phase === "compiling" ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Writing your brief…
                      </>
                    ) : (
                      <>
                        Build it
                        <ArrowUp />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
