/**
 * The question asked before a project's files are put back to an earlier state.
 *
 * Handles: both ways of going back - undoing one change from the chat (the project as it stood just before that
 * change) and restoring a version picked in the History panel - by first asking the server what would change,
 * saying it in one plain sentence with the files named, and only then, on a press, restoring. A restore that would
 * change nothing says so and offers nothing to press.
 *
 * Nothing is lost by going back: a restore is saved as a new entry in the history, so the state left behind can be
 * returned to the same way. The dialog says that, because "restore" otherwise reads as something that cannot be
 * taken back. A restore that lost a race with another change, or failed, changed nothing and is reported as that.
 */
import { useEffect, useState } from "react";
import { History, Undo2 } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { restoreSummary } from "@/lib/revisions";
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

const MAX_LISTED = 8;

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <DialogTitle>{isUndo ? "Undo this change?" : "Go back to this version?"}</DialogTitle>
          <DialogDescription>
            {isUndo
              ? <>Your project goes back to how it was just before &ldquo;{target?.title}&rdquo;.</>
              : <>Your project goes back to how it was after &ldquo;{target?.title}&rdquo;.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[3.5rem] text-sm">
          {loadError ? (
            <p className="text-destructive">{loadError}</p>
          ) : !changes ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <OrbitSpinner className="h-3.5 w-3.5" />
              Checking what would change…
            </p>
          ) : (
            <>
              <p className="text-foreground/90">{restoreSummary(changes)}</p>
              {hasChanges && (
                <ul className="mt-2.5 flex flex-col gap-1 text-xs">
                  {changes.slice(0, MAX_LISTED).map((change) => (
                    <li key={change.path} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-mono text-foreground/80">{change.path}</span>
                      <span className="shrink-0 text-muted-foreground">{KIND_WORDS[change.kind]}</span>
                    </li>
                  ))}
                  {changes.length > MAX_LISTED && (
                    <li className="text-muted-foreground">and {changes.length - MAX_LISTED} more</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isRestoring} onClick={onClose}>
            {hasChanges ? "Cancel" : "Close"}
          </Button>
          {hasChanges && (
            <Button type="button" disabled={isRestoring} onClick={restore} className="gap-1.5">
              {isRestoring ? <OrbitSpinner className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {isRestoring ? "Putting it back…" : isUndo ? "Undo this change" : "Go back to this version"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
