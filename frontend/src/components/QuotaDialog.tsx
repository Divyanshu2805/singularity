/**
 * What a spent allowance looks like to the person who hit it.
 *
 * Handles: saying which limit was reached, showing the numbers off the error itself rather than parsing its sentence,
 * and offering the upgrade.
 *
 * Deliberately a dialog offering an upgrade rather than a red error toast: nothing went wrong and the request was
 * perfectly valid - they have simply reached the edge of what they are paying for, and treating that as a failure is
 * both inaccurate and the worst possible framing at the moment someone is most likely to consider paying.
 */
import { useNavigate } from "react-router-dom";
import { Sparkles, Zap } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatResetIn, formatTokens } from "@/lib/billing";
import type { QuotaDetails } from "@/lib/types";

export function QuotaDialog({ quota, onClose }: { quota: QuotaDetails | null; onClose: () => void }) {
  const navigate = useNavigate();

  if (!quota) return null;

  const isTokens = quota.reason === "DAILY_TOKENS";
  const noun = quota.reason === "PREVIEW_LIMIT" ? "live preview" : "project";
  const resetsAt = quota.resetsAt ? new Date(quota.resetsAt) : null;

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            {isTokens ? <Zap className="h-4.5 w-4.5" /> : <Sparkles className="h-4.5 w-4.5" />}
          </div>
          <AlertDialogTitle>
            {isTokens
              ? "You've used today's AI allowance"
              : `The ${quota.planName} plan includes ${quota.limit} ${quota.limit === 1 ? noun : `${noun}s`}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isTokens ? (
              <>
                That's {formatTokens(quota.used)} of {formatTokens(quota.limit)} tokens on the {quota.planName}{" "}
                plan. It refills in {formatResetIn(resetsAt)} — or upgrade now for a bigger daily budget.
              </>
            ) : (
              <>
                You're using all {quota.used} of them. Upgrade for more, or{" "}
                {quota.reason === "PREVIEW_LIMIT" ? "stop a preview you're not using" : "delete a project you've finished with"} to
                make room.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction onClick={() => navigate("/pricing")}>See plans</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
