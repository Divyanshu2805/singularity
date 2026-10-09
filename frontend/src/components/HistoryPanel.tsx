/**
 * A project's history: every change that was saved, newest first, and a way back to any of them.
 *
 * Handles: loading the list when it is opened and not before, naming each change in plain words (lib/revisions) -
 * the request that asked for it, a file edited by hand, a step back - with who made it, when and which files, marking
 * the version the project is on, and handing a chosen version to the restore question. A viewer can read the history
 * and is not offered a way back; nobody is while a response is being written, since it is about to change the files.
 *
 * It is drawn with the app's own pieces: a dialog, rows on the window's quiet tile, the chip for the one action a
 * row has. The list is fetched each time it opens, so it is never a stale copy of a history someone else added to.
 */
import { useQuery } from "@tanstack/react-query";
import { FilePen, History, RotateCcw, Sparkles, type LucideIcon } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, getUserInfo } from "@/lib/api";
import { historyEntries, timeAgo, type TurnForHistory } from "@/lib/revisions";
import type { RevisionSource } from "@/lib/types";
import type { RestoreTarget } from "./RestoreDialog";

const SOURCE_ICONS: Record<RevisionSource, LucideIcon> = {
  AI_GENERATION: Sparkles,
  MANUAL_EDIT: FilePen,
  RESTORE: RotateCcw,
};

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
      <DialogContent aria-describedby={undefined} className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-primary">
            <History className="h-4 w-4" />
          </div>
          <DialogTitle>History</DialogTitle>
        </DialogHeader>

        {restoreBlockedReason && (
          <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
            {restoreBlockedReason}
          </p>
        )}

        <div className="-mx-2 min-h-[8rem] flex-1 overflow-y-auto px-2 [scrollbar-gutter:stable]">
          {revisions.isLoading ? (
            <p className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <OrbitSpinner className="h-4 w-4" />
              Loading the history…
            </p>
          ) : revisions.isError ? (
            <p className="flex h-32 items-center justify-center px-6 text-center text-sm text-destructive">
              {revisions.error instanceof Error ? revisions.error.message : "Couldn't load this project's history."}
            </p>
          ) : entries.length === 0 ? (
            <p className="flex h-32 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Nothing here yet. Each change you ask for or make by hand is kept here, so you can always go back.
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5 pb-1">
              {entries.map((entry) => {
                const Icon = SOURCE_ICONS[entry.source];
                return (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13px] font-medium leading-snug text-foreground">{entry.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {[entry.byline, timeAgo(entry.at)].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground" title={entry.paths.join("\n")}>
                        {entry.files}
                      </p>
                    </div>
                    {entry.isCurrent ? (
                      <span className="mt-0.5 shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        You are here
                      </span>
                    ) : entry.matchesCurrent ? (
                      <span className="mt-0.5 shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Same as now
                      </span>
                    ) : canRestore ? (
                      <button
                        type="button"
                        disabled={!!restoreBlockedReason}
                        onClick={() => onRestore({ revisionId: entry.id, before: false, title: entry.title })}
                        className="app-chip mt-0.5 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-foreground/85 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Go back
                      </button>
                    ) : null}
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
