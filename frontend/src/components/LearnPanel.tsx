/**
 * The project's learning panel: a tour of the whole project, and a glossary of the words met along the way.
 *
 * Handles: the tour tab - the map of the project as it stands, written once when the person asks for it, kept, read
 * back each time the panel opens, and written again only when they press to - and the glossary tab - the words they
 * have met, each with a plain meaning, an everyday comparison and an example from their own code, one field that
 * both finds a word they have and defines one they do not, and a way to ask ExplainLLM more about a word or to
 * remove it.
 *
 * Nothing is requested by opening the panel. The tour is written when "Write the tour" is pressed; a word is defined
 * when it is pressed in a lesson, in the tour, or looked up here. The server keeps both, so a word pressed a second
 * time, in this session or any later one, comes back without the model. A path in the tour opens that file in the
 * editor, and a marked word in the tour opens its entry here.
 *
 * The panel never changes size. It is one fixed box - as tall as the window allows, up to a limit - whatever tab is
 * open and however much has been written, and each part that can grow scrolls inside it: the tour's text, the list
 * of words, a word's entry. It used to be as tall as its content, so it jumped when a tab was pressed and crept
 * downward as an answer streamed in, since a dialog is centred. For the same reason everything that comes and goes
 * has a place kept for it: the line that says what is being written and the row of actions sit in a foot that is
 * always there, a word being defined takes its alphabetical place in the list at once rather than a row at the top
 * that then moves, and its comet sits after the word so the word does not shift when it goes. While the first words
 * are on their way the pane shows the app's skeleton lines, where it once went on showing the empty state.
 *
 * It is drawn with the app's own pieces: a dialog, the header's sliding track for its two tabs, the lesson cards of
 * the chat, the selected-row highlight for the open word, the composer's field and the chip for each action. On a
 * narrow window the words become one scrolling row of chips above the entry, so the entry keeps the height.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CircleAlert, Compass, FilePen, GraduationCap, ListChecks, Map as MapIcon, MessagesSquare, Pencil, Search, Trash2 } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { Prose, TaughtCard } from "@/components/ChatEventRenderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cleanTerm, filterEntries, findEntry, isNotATerm, termKey } from "@/lib/learn";
import { learnPanel, useLearnPanel, type LearnTab } from "@/lib/learn-panel-store";
import { parseBigPicture, termQuestion, type LessonQuestion } from "@/lib/lesson";
import { forget, requestTour, termStateKey, tourKey, useLesson } from "@/lib/lesson-store";
import { timeAgo } from "@/lib/revisions";
import { cn } from "@/lib/utils";

const TABS: { id: LearnTab; label: string; Icon: typeof MapIcon }[] = [
  { id: "tour", label: "Project tour", Icon: MapIcon },
  { id: "glossary", label: "Glossary", Icon: BookOpen },
];

const tourIcon = (title: string) =>
  /file/i.test(title) ? FilePen : /click|travel|work/i.test(title) ? ListChecks : /change/i.test(title) ? Pencil : Compass;

const CHIP = "app-chip inline-flex h-7 shrink-0 items-center gap-1.5 px-3 text-xs text-foreground/90 disabled:pointer-events-none disabled:opacity-50";
const FOOT = "flex h-11 shrink-0 items-center gap-2 border-t border-white/[0.08] pt-3";

function Writing({ label }: { label: string }) {
  return (
    <div className="space-y-2.5" aria-label={label}>
      <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <OrbitSpinner className="h-3 w-3" />
        {label}&hellip;
      </p>
      {[86, 97, 62, 91, 48].map((width) => (
        <div key={width} className="app-skeleton h-2.5 rounded" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

function Status({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px]", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </span>
  );
}

function TourTab({ projectId, onOpenFile }: { projectId: string; onOpenFile: (path: string) => void }) {
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ["project-tour", projectId],
    queryFn: () => api.getProjectTour(projectId),
    staleTime: 0,
    gcTime: 0,
  });
  const live = useLesson(tourKey(projectId));
  const text = live?.text || saved.data?.content || "";
  const isWriting = live?.status === "loading";
  const failure = live?.status === "error"
    ? live.error ?? "Couldn't write the tour."
    : saved.isError && !live
      ? saved.error instanceof Error ? saved.error.message : "Couldn't load the tour."
      : null;

  useEffect(() => {
    if (live?.status === "done") void queryClient.invalidateQueries({ queryKey: ["project-tour", projectId] });
  }, [live?.status, projectId, queryClient]);

  const picture = useMemo(() => (text ? parseBigPicture(text, !isWriting) : null), [text, isWriting]);
  const onTerm = (term: string) => learnPanel.openTerm(projectId, term);
  const onPath = (path: string) => {
    onOpenFile(path);
    learnPanel.close();
  };
  const isLoading = saved.isLoading && !live;

  return (
    <div role="tabpanel" aria-label="Project tour" className="flex min-h-0 flex-1 flex-col">
      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pb-3 pr-2 [scrollbar-gutter:stable]">
        {picture ? (
          <div className="min-w-0 space-y-3">
            {picture.intro && <Prose text={picture.intro} onTerm={onTerm} onPath={onPath} />}
            {picture.sections.map((section, index) => (
              <TaughtCard key={`${section.title}-${index}`} title={section.title} Icon={tourIcon(section.title)}>
                <Prose text={section.text} onTerm={onTerm} onPath={onPath} />
              </TaughtCard>
            ))}
          </div>
        ) : isLoading ? (
          <Writing label="Loading the tour" />
        ) : isWriting ? (
          <Writing label="Reading your files" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-primary">
              <MapIcon className="h-4 w-4" />
            </span>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              A map of your whole project as it stands now: what each file is for, and how a click travels through them.
              It is written once and kept.
            </p>
          </div>
        )}
      </div>

      <div className={FOOT}>
        {failure ? (
          <Status tone="error">
            <CircleAlert className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={failure}>{failure}</span>
          </Status>
        ) : isWriting ? (
          <Status>
            <OrbitSpinner className="h-3 w-3" />
            <span className="truncate">{picture ? "Still writing…" : "This takes a few seconds"}</span>
          </Status>
        ) : (
          <Status>
            <span className="truncate">
              {picture && saved.data?.writtenAt ? `Written ${timeAgo(saved.data.writtenAt).toLowerCase()}` : picture ? "" : "Nothing is written until you ask."}
            </span>
          </Status>
        )}
        {picture ? (
          <button
            type="button"
            disabled={isWriting}
            onClick={() => requestTour(projectId, true)}
            title="Reads your files again and replaces this tour. It uses some of your daily allowance."
            className={CHIP}
          >
            <MapIcon className="h-3 w-3 text-primary/80" />
            Write it again
          </button>
        ) : (
          <button type="button" disabled={isWriting || isLoading} onClick={() => requestTour(projectId)} className={CHIP}>
            <MapIcon className="h-3 w-3 text-primary/80" />
            {failure && live ? "Try again" : "Write the tour"}
          </button>
        )}
      </div>
    </div>
  );
}

function GlossaryTab({ projectId, term, onAsk }: { projectId: string; term: string | null; onAsk: (ask: LessonQuestion) => void }) {
  const queryClient = useQueryClient();
  const entries = useQuery({
    queryKey: ["glossary", projectId],
    queryFn: () => api.getGlossary(projectId),
    staleTime: 0,
    gcTime: 0,
  });
  const [typed, setTyped] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const entryRef = useRef<HTMLDivElement>(null);

  const live = useLesson(term ? termStateKey(projectId, term) : null);
  const entry = findEntry(entries.data, term);
  const text = live?.text || entry?.definition || "";
  const isWriting = live?.status === "loading";
  const isRefused = isNotATerm(text);
  const isPending = !!term && !entry && !!live && live.status !== "error" && !isRefused;

  const words = useMemo(() => {
    const kept = (entries.data ?? []).map((item) => ({ key: termKey(item.term), term: item.term, pending: false }));
    if (isPending && term) kept.push({ key: termKey(term), term, pending: true });
    return filterEntries(kept.sort((a, b) => a.key.localeCompare(b.key)), typed);
  }, [entries.data, isPending, term, typed]);
  const openKey = term ? termKey(term) : null;
  const typedWord = cleanTerm(typed);
  const hasTyped = !!findEntry(entries.data, typedWord);

  useEffect(() => {
    if (live?.status === "done") void queryClient.invalidateQueries({ queryKey: ["glossary", projectId] });
  }, [live?.status, projectId, queryClient]);

  useEffect(() => {
    setFailure(null);
    entryRef.current?.scrollTo?.({ top: 0 });
  }, [openKey]);

  const submit = () => {
    if (!typedWord) return;
    if (hasTyped) learnPanel.selectTerm(typedWord);
    else learnPanel.openTerm(projectId, typedWord);
    setTyped("");
  };

  const remove = async () => {
    if (!entry || !term) return;
    setFailure(null);
    try {
      await api.deleteGlossaryEntry(projectId, entry.id);
      forget(termStateKey(projectId, term));
      learnPanel.selectTerm(null);
      await queryClient.invalidateQueries({ queryKey: ["glossary", projectId] });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Couldn't remove this word.");
    }
  };

  const problem = failure ?? (live?.status === "error" ? live.error ?? "Couldn't define this word." : null);

  return (
    <div role="tabpanel" aria-label="Glossary" className="flex min-h-0 flex-1 flex-col gap-3">
      <form
        className="app-field relative flex shrink-0 items-center gap-1.5 rounded-2xl p-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Search aria-hidden="true" className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={typed}
          maxLength={80}
          placeholder="Find a word, or look up a new one such as props"
          aria-label="Look up a word"
          onChange={(event) => setTyped(event.target.value)}
          className="min-w-0 flex-1 bg-transparent py-1 pr-1 text-[13px] text-foreground caret-primary outline-none placeholder:text-muted-foreground"
        />
        <button type="submit" disabled={!typedWord} className={cn(CHIP, "w-[4.75rem] justify-center")}>
          {hasTyped ? "Open" : "Define"}
        </button>
      </form>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:grid-rows-1">
        <div className="min-h-0 min-w-0 sm:overflow-y-auto sm:pr-1 sm:[scrollbar-gutter:stable]">
          {entries.isLoading ? (
            <div className="flex gap-1.5 sm:flex-col" aria-label="Loading your words">
              {[72, 54, 64].map((width) => (
                <div key={width} className="app-skeleton h-7 shrink-0 rounded-lg sm:w-auto" style={{ width: `${width}%` }} />
              ))}
            </div>
          ) : entries.isError ? (
            <p className="py-1.5 text-xs text-destructive">{entries.error instanceof Error ? entries.error.message : "Couldn't load the glossary."}</p>
          ) : words.length === 0 ? (
            <p className="py-1.5 text-xs leading-relaxed text-muted-foreground">
              {(entries.data?.length ?? 0) === 0 && !typedWord
                ? "No words yet. Press a highlighted word in a lesson or the tour, or look one up."
                : "Not one of your words yet. Press Define to add it."}
            </p>
          ) : (
            <ul aria-label="Your words" className="flex gap-1 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible sm:pb-0">
              {words.map((word) => (
                <li key={word.key} className="shrink-0 sm:shrink">
                  <button
                    type="button"
                    aria-current={word.key === openKey}
                    aria-busy={word.pending || undefined}
                    onClick={() => learnPanel.selectTerm(word.term)}
                    className={cn(
                      "flex h-7 w-full max-w-[12rem] items-center gap-1.5 rounded-lg px-2.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-none",
                      word.key === openKey ? "row-active" : "hl-row text-foreground/85"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{word.term}</span>
                    {word.pending && <OrbitSpinner className="h-3 w-3 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.025]">
          {!term ? (
            <p className="flex flex-1 items-center justify-center px-6 text-center text-xs leading-relaxed text-muted-foreground">
              Pick one of your words to read it again, or look a new one up.
            </p>
          ) : (
            <>
              <h3 className="shrink-0 truncate border-b border-white/[0.07] px-3.5 py-2.5 font-display text-[15px] font-semibold tracking-tight text-foreground" title={term}>
                {entry?.term ?? term}
              </h3>
              <div ref={entryRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 [scrollbar-gutter:stable]">
                {text ? (
                  <ChatMarkdown className="text-[13px]">{text}</ChatMarkdown>
                ) : problem ? null : (
                  <Writing label="Looking for it in your project" />
                )}
                {isRefused && !isWriting && <p className="mt-2 text-[11.5px] text-muted-foreground">It was not added to your glossary.</p>}
              </div>
              <div className={cn(FOOT, "mx-3.5 mb-2.5")}>
                {problem ? (
                  <Status tone="error">
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate" title={problem}>{problem}</span>
                  </Status>
                ) : isWriting ? (
                  <Status>
                    <OrbitSpinner className="h-3 w-3" />
                    <span className="truncate">{text ? "Still writing…" : "This takes a few seconds"}</span>
                  </Status>
                ) : (
                  <Status>{null}</Status>
                )}
                {live?.status === "error" ? (
                  <button type="button" onClick={() => learnPanel.openTerm(projectId, term)} className={CHIP}>
                    Try again
                  </button>
                ) : (
                  !isRefused && (
                    <>
                      {entry && (
                        <button
                          type="button"
                          onClick={() => void remove()}
                          aria-label={`Remove ${entry.term} from your glossary`}
                          title="Remove from your glossary"
                          className="icon-btn h-7 w-7 shrink-0 rounded-lg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!text || isWriting}
                        onClick={() => {
                          learnPanel.close();
                          onAsk({ question: termQuestion(term) });
                        }}
                        className={CHIP}
                      >
                        <MessagesSquare className="h-3 w-3 shrink-0 text-primary/80" />
                        Ask ExplainLLM more
                      </button>
                    </>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function LearnPanel({ projectId, onOpenFile, onAsk }: {
  projectId: string | undefined;
  onOpenFile: (path: string) => void;
  onAsk: (ask: LessonQuestion) => void;
}) {
  const panel = useLearnPanel();
  const open = !!projectId && panel.projectId === projectId;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) learnPanel.close(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[min(40rem,calc(100dvh-2rem))] w-[calc(100vw-1.5rem)] flex-col gap-3.5 rounded-[22px] p-5 sm:max-w-3xl sm:p-6"
      >
        <DialogHeader className="shrink-0 flex-row flex-wrap items-center gap-3 space-y-0 text-left sm:pr-9">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-primary">
            <GraduationCap className="h-4 w-4" />
          </div>
          <DialogTitle className="min-w-0 flex-1 truncate pr-9 sm:pr-0">Learn your project</DialogTitle>
          <div role="tablist" aria-label="Learning tools" className="app-track relative grid w-full shrink-0 grid-cols-2 p-0.5 sm:w-auto">
            <TabButtons tab={panel.tab} />
          </div>
        </DialogHeader>

        {open && projectId && (panel.tab === "tour"
          ? <TourTab projectId={projectId} onOpenFile={onOpenFile} />
          : <GlossaryTab projectId={projectId} term={panel.term} onAsk={onAsk} />)}
      </DialogContent>
    </Dialog>
  );
}

function TabButtons({ tab }: { tab: LearnTab }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "seg-pill absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] transition-transform duration-[650ms] ease-[cubic-bezier(0.34,1.35,0.64,1)] motion-reduce:transition-none",
          tab === "glossary" && "translate-x-full"
        )}
      />
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => learnPanel.setTab(id)}
          className={cn(
            "relative z-10 flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className={cn("h-3.5 w-3.5 transition-colors", tab === id && "text-primary")} />
          {label}
        </button>
      ))}
    </>
  );
}
