/**
 * The question asked before a project's files are put back to an earlier state.
 *
 * Handles: both ways of going back - undoing one change from the chat (the project as it stood just before that
 * change) and restoring a version picked in the History panel - by first asking the server what would change,
 * saying it in one plain sentence with the files named, and only then, on a press, restoring. A restore that would
 * change nothing says so and offers nothing to press. The files are one divided list: the file's name first, its
 * folder beneath it, and a chip for what happens to it only when the files are not all treated alike (the sentence
 * above already says it otherwise).
 *
 * Nothing is lost by going back: a restore is saved as a new entry in the history, so the state left behind can be
 * returned to the same way. The dialog says that, because "restore" otherwise reads as something that cannot be
 * taken back. A restore that lost a race with another change, or failed, changed nothing and is reported as that.
 *
 * It is drawn like the History dialog it opens from: it drops in (.dialog-pop), the header carries the glowing icon
 * tile, and each file is a card that rises in turn with a chip saying what happens to it. Its two buttons are the
 * chip, the prompt's Build button, centred, so both look and answer the pointer exactly as that one does.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { FileCode2, FileText, History, Undo2 } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { restoreSummary } from "@/lib/revisions";
import { cn } from "@/lib/utils";
import type { RevisionChange } from "@/lib/types";

export interface RestoreTarget {
  revisionId: number;
  before: boolean;
  title: string;
}

const KIND_WORDS: Record<RevisionChange["kind"], string> = {
  MODIFIED: "goes back",
  DELETED: "removed",
  ADDED: "comes back",
};

const KIND_STYLES: Record<RevisionChange["kind"], string> = {
  MODIFIED: "bg-primary/10 text-primary",
  DELETED: "bg-destructive/10 text-destructive",
  ADDED: "bg-emerald-500/10 text-emerald-400",
};

const MAX_LISTED = 8;

const CODE_FILE = /\.(tsx?|jsx?|mjs|cjs|css|html|json|sql|java|ya?ml)$/i;

const splitPath = (path: string) => {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? { name: path, folder: "" } : { name: path.slice(cut + 1), folder: path.slice(0, cut) };
};

export function RestoreDialog({ projectId, target, onClose, onRestored }: {
  projectId: string;
  target: RestoreTarget | null;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { toast } = useToast();
  const [changes, setChanges] = useState<RevisionChange[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (!target) return;
    let isCancelled = false;
    setChanges(null);
    setLoadError(null);
    setIsRestoring(false);
    api.previewRestore(projectId, target.revisionId, target.before).then(
      (found) => {
        if (!isCancelled) setChanges(found);
      },
      (error) => {
        if (!isCancelled) setLoadError(error instanceof Error ? error.message : "Couldn't work out what this would change.");
      }
    );
    return () => {
      isCancelled = true;
    };
  }, [projectId, target]);

  const isUndo = !!target?.before;
  const hasChanges = !!changes && changes.length > 0;
  const isMixed = !!changes && new Set(changes.map((change) => change.kind)).size > 1;

  const restore = async () => {
    if (!target || isRestoring) return;
    setIsRestoring(true);
    try {
      const result = await api.restoreRevision(projectId, target.revisionId, target.before);
      if (result.status === "APPLIED") {
        toast({
          title: isUndo ? "Change undone" : "Version restored",
          description: "Your files are back to how they were. This is saved in History too, so you can return to where you just were.",
        });
        onRestored();
        onClose();
        return;
      }
      toast({
        title: "Nothing was changed",
        description: result.status === "CONFLICT"
          ? "Your project changed while this was being done. Try again."
          : "The files couldn't be put back this time. Try again.",
        variant: "destructive",
      });
    } catch (error) {
      toast({
        title: isUndo ? "Couldn't undo this change" : "Couldn't restore this version",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
    setIsRestoring(false);
  };

  const Icon = isUndo ? Undo2 : History;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !isRestoring && onClose()}>
      <DialogContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="dialog-pop w-[calc(100vw-1.5rem)] gap-4 rounded-[24px] p-5 sm:max-w-xl sm:p-7"
      >
        <DialogHeader className="flex-row items-start gap-3.5 space-y-0 text-left sm:pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/[0.07] text-primary shadow-[0_0_24px_-8px_hsl(var(--primary)/0.6)]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-xl leading-tight">{isUndo ? "Undo this change?" : "Go back to this version?"}</DialogTitle>
            <DialogDescription className="mt-1.5 break-words leading-snug">
              {isUndo
                ? <>Your project goes back to how it was just before &ldquo;{target?.title}&rdquo;.</>
                : <>Your project goes back to how it was after &ldquo;{target?.title}&rdquo;.</>}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-[3.5rem] text-sm">
          {loadError ? (
            <p className="app-rise text-destructive">{loadError}</p>
          ) : !changes ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="app-skeleton app-fade h-9 rounded-xl" style={{ "--i": i } as CSSProperties} />
              ))}
              <p className="flex items-center gap-2 pt-1 text-muted-foreground">
                <OrbitSpinner className="h-3.5 w-3.5" />
                Checking what would change…
              </p>
            </div>
          ) : (
            <>
              <p className="app-rise text-foreground/90">{restoreSummary(changes)}</p>
              {hasChanges && (
                <ul className="app-field app-rise mt-3 max-h-[min(18rem,40dvh)] divide-y divide-white/[0.06] overflow-y-auto rounded-2xl text-xs [scrollbar-gutter:stable]">
                  {changes.slice(0, MAX_LISTED).map((change) => {
                    const { name, folder } = splitPath(change.path);
                    const FileIcon = CODE_FILE.test(name) ? FileCode2 : FileText;
                    return (
                      <li key={change.path} className="flex items-center gap-3 px-3.5 py-1.5" title={change.path}>
                        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", KIND_STYLES[change.kind])}>
                          <FileIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[13px] font-medium text-foreground">{name}</span>
                          {folder && <span className="block truncate text-[11px] text-muted-foreground">{folder}</span>}
                        </span>
                        {isMixed && (
                          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium", KIND_STYLES[change.kind])}>
                            {KIND_WORDS[change.kind]}
                          </span>
                        )}
                      </li>
                    );
                  })}
                  {changes.length > MAX_LISTED && (
                    <li className="px-3.5 py-2.5 text-muted-foreground">and {changes.length - MAX_LISTED} more</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2.5 sm:justify-center sm:space-x-0">
          <Button type="button" variant="chip" size="lg" disabled={isRestoring} onClick={onClose}>
            {hasChanges ? "Cancel" : "Close"}
          </Button>
          {hasChanges && (
            <Button type="button" variant="chip" size="lg" disabled={isRestoring} onClick={restore} className="gap-1.5">
              {isRestoring ? <OrbitSpinner className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {isRestoring ? "Putting it back…" : isUndo ? "Undo this change" : "Go back to this version"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
