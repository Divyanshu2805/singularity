/**
 * A project's history: every change that was saved, newest first, and a way back to any of them.
 *
 * Handles: loading the list when it is opened and not before, naming each change in plain words (lib/revisions) -
 * the request that asked for it, a file edited by hand, a step back - with who made it, when and which files, marking
 * the version the project is on, and handing a chosen version to the restore question. A viewer can read the history
 * and is not offered a way back; nobody is while a response is being written, since it is about to change the files.
 *
 * Each row says how many files it added, edited and removed, and lists the files with a
 * mark for what happened to each (the rest behind "+N more"); the time carries its exact date on hover.
 *
 * It is drawn with the app's own pieces: a dialog that drops in (.dialog-pop), cards on the window's quiet tile hung on
 * a rail of nodes (.history-row), the chip for the one action a row has, rows that rise in turn on opening and a
 * glowing node for the version the project is on. The list is fetched each time it opens, so it is never a stale copy
 * of a history someone else added to.
 */
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePen, FilePlus2, FileText, FileX2, History, RotateCcw, Sparkles, type LucideIcon } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, getUserInfo } from "@/lib/api";
import { describeChangeCounts, historyEntries, timeAgo, type TurnForHistory } from "@/lib/revisions";
import type { RevisionChange, RevisionSource } from "@/lib/types";
import type { RestoreTarget } from "./RestoreDialog";

const SOURCE_ICONS: Record<RevisionSource, LucideIcon> = {
  AI_GENERATION: Sparkles,
  MANUAL_EDIT: FilePen,
  RESTORE: RotateCcw,
};

const FILE_KINDS: Record<RevisionChange["kind"], { icon: LucideIcon; label: string; tone: string }> = {
  ADDED: { icon: FilePlus2, label: "Added", tone: "text-emerald-400" },
  MODIFIED: { icon: FileText, label: "Edited", tone: "text-muted-foreground" },
  DELETED: { icon: FileX2, label: "Removed", tone: "text-red-400" },
};

const LISTED_FILES = 5;

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function HistoryPanel({ projectId, open, onOpenChange, turns, canRestore, restoreBlockedReason, onRestore }: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turns: readonly TurnForHistory[];
  canRestore: boolean;
  restoreBlockedReason?: string | null;
  onRestore: (target: RestoreTarget) => void;
}) {
  const revisions = useQuery({
    queryKey: ["revisions", projectId],
    queryFn: () => api.getRevisions(projectId),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });
  const members = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => api.getProjectMembers(projectId),
    enabled: open,
  });

  const entries = revisions.data
    ? historyEntries(revisions.data, turns, members.data ?? [], getUserInfo()?.id)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="dialog-pop flex max-h-[min(46rem,calc(100dvh-2rem))] w-[calc(100vw-1.5rem)] flex-col gap-4 rounded-[28px] p-5 sm:max-w-2xl sm:p-7"
      >
        <DialogHeader className="shrink-0 flex-row items-center gap-3.5 space-y-0 text-left sm:pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/[0.07] text-primary shadow-[0_0_24px_-8px_hsl(var(--primary)/0.6)]">
            <History className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-xl">History</DialogTitle>
            <p className="mt-1.5 text-[12.5px] leading-none text-muted-foreground">
              {entries.length > 0
                ? `${entries.length} saved ${entries.length === 1 ? "version" : "versions"} · newest first`
                : "Every change is kept, so you can always go back."}
            </p>
          </div>
        </DialogHeader>

        {restoreBlockedReason && (
          <p className="app-field shrink-0 rounded-2xl px-3.5 py-2.5 text-xs text-muted-foreground">
            {restoreBlockedReason}
          </p>
        )}

        <div className="history-list -ml-5 -mr-3 min-h-0 flex-1 overflow-y-auto pl-5 pr-3 [scrollbar-gutter:stable]">
          {revisions.isLoading ? (
            <div className="flex flex-col gap-3 pt-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="app-fade flex gap-3.5" style={{ "--i": i } as CSSProperties}>
                  <div className="app-skeleton h-[2.125rem] w-[2.125rem] shrink-0 rounded-2xl" />
                  <div className="app-skeleton h-[4.5rem] flex-1 rounded-[22px]" />
                </div>
              ))}
              <p className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
                <OrbitSpinner className="h-4 w-4" />
                Loading the history…
              </p>
            </div>
          ) : revisions.isError ? (
            <p className="flex h-40 items-center justify-center px-6 text-center text-sm text-destructive">
              {revisions.error instanceof Error ? revisions.error.message : "Couldn't load this project's history."}
            </p>
          ) : entries.length === 0 ? (
            <div className="app-rise flex h-56 flex-col items-center justify-center gap-3 px-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
                <History className="h-5 w-5" />
              </span>
              <p className="max-w-xs text-sm text-muted-foreground">
                Nothing here yet. Each change you ask for or make by hand is kept here, so you can always go back.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col pb-4 pt-7">
              {entries.map((entry, index) => {
                const Icon = SOURCE_ICONS[entry.source];
                const when = timeAgo(entry.at);
                const exact = entry.at ? new Date(entry.at).toLocaleString() : undefined;
                return (
                  <li
                    key={entry.id}
                    className="history-row app-rise"
                    style={{ "--i": Math.min(index, 10) } as CSSProperties}
                  >
                    <span className="history-node" data-current={entry.isCurrent}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div
                      className="history-card app-field flex flex-col gap-3 rounded-[22px] px-4 py-3.5 sm:flex-row sm:items-center"
                      data-current={entry.isCurrent}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-snug text-foreground">{entry.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          {entry.byline && <span className="text-foreground/80">{entry.byline}</span>}
                          {entry.byline && when && <span aria-hidden="true">·</span>}
                          {when && <span title={exact}>{when}</span>}
                          <span aria-hidden="true">·</span>
                          <span className="rounded-full border border-white/[0.1] px-1.5 font-mono text-[10.5px] leading-4 text-muted-foreground/90">v{entries.length - index}</span>
                        </p>
                        <p className="mt-2 text-[11.5px] text-muted-foreground">{describeChangeCounts(entry)}</p>
                        {entry.fileChanges.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Files in this version">
                            {entry.fileChanges.slice(0, LISTED_FILES).map((change) => {
                              const kind = FILE_KINDS[change.kind];
                              const FileIcon = kind.icon;
                              return (
                                <li
                                  key={change.path}
                                  title={`${kind.label}: ${change.path}`}
                                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-foreground/80"
                                >
                                  <FileIcon className={`h-3 w-3 shrink-0 ${kind.tone}`} />
                                  <span className="truncate">{baseName(change.path)}</span>
                                </li>
                              );
                            })}
                            {entry.fileChanges.length > LISTED_FILES && (
                              <li
                                title={entry.paths.slice(LISTED_FILES).join(", ")}
                                className="inline-flex items-center rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground"
                              >
                                +{entry.fileChanges.length - LISTED_FILES} more
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                      {entry.isCurrent ? (
                        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-full border border-primary/25 bg-primary/10 px-3.5 text-xs font-medium text-primary sm:self-center">
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                          You are here
                        </span>
                      ) : entry.matchesCurrent ? (
                        <span className="inline-flex h-8 shrink-0 items-center self-start rounded-full bg-white/[0.05] px-3.5 text-xs font-medium text-muted-foreground sm:self-center">
                          Same as now
                        </span>
                      ) : canRestore ? (
                        <button
                          type="button"
                          disabled={!!restoreBlockedReason}
                          onClick={() => onRestore({ revisionId: entry.id, before: false, title: entry.title })}
                          className="app-chip group inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-full px-3.5 text-xs text-foreground/90 disabled:pointer-events-none disabled:opacity-50 sm:self-center"
                        >
                          <RotateCcw className="h-3 w-3 transition-transform duration-500 group-hover:-rotate-[360deg]" />
                          Go back
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
