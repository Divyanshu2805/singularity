/**
 * The Delete account button of the Settings page, and the steps behind it.
 *
 * Handles: saying plainly what deleting takes with it, asking for the word DELETE to be typed, asking the person to sign
 * in again (the security boxes' ConfirmIdentityDialog), then deleting the account and leaving the app signed out.
 *
 * Signing in again is not a formality: the server refuses a deletion whose sign-in is more than five minutes old, so a
 * device left signed in is never enough to delete someone's account (AccountDeletionServiceImpl). The typed word is
 * the guard against a slip of the hand; the sign-in is the guard against someone else. While the deletion runs the
 * button holds a spinner and nothing can be pressed twice; it takes a few seconds, more when projects have previews
 * running. If it fails the account is untouched, the server having stopped before anything of its own changed, and
 * the person is told they can try again.
 */
import { useState } from "react";
import type { User } from "firebase/auth";
import { Trash2 } from "lucide-react";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { ConfirmIdentityDialog } from "@/components/settings/SecuritySections";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { signOut } from "@/lib/api";
import { deleteAccount, releaseFirebaseUser } from "@/lib/firebase-auth";

const CONFIRM_WORD = "DELETE";

const WHAT_GOES = [
  "Every project you own, for everyone in it - its files, previews and published link.",
  "Your place in projects others shared with you. Their projects stay.",
  "Your chats, lessons, notes, glossary and usage history.",
  "Your plan, cancelled now with no refund for the rest of the period.",
  "Your sign-in, and your GitHub connection. Repositories you pushed to stay on GitHub.",
];

export function DeleteAccount() {
  const { toast } = useToast();
  const [warningOpen, setWarningOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setDeleting] = useState(false);

  const openWarning = (open: boolean) => {
    setWarningOpen(open);
    if (!open) setTyped("");
  };

  const goOn = () => {
    openWarning(false);
    setConfirmOpen(true);
  };

  const onConfirmed = async (user: User) => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await deleteAccount(user);
      signOut("/");
    } catch (error) {
      void releaseFirebaseUser();
      setDeleting(false);
      toast({
        title: "Your account wasn't deleted",
        description: `${error instanceof Error ? error.message : "Something went wrong."} Nothing was removed - you can try again.`,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" disabled={isDeleting} onClick={() => openWarning(true)}>
        {isDeleting ? <OrbitSpinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5 text-red-500" />}
        {isDeleting ? "Deleting…" : "Delete account"}
      </Button>

      <AlertDialog open={warningOpen} onOpenChange={openWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account for good?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone. Deleting your account removes:</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {WHAT_GOES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typed === CONFIRM_WORD) goOn();
            }}
          >
            <label htmlFor="delete-confirm" className="text-sm font-medium">
              Type <span className="font-mono text-foreground">{CONFIRM_WORD}</span> to confirm
            </label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-2"
            />
            <AlertDialogFooter className="mt-5">
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={typed !== CONFIRM_WORD}>
                Continue
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmIdentityDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirmed={(user) => void onConfirmed(user)}
        purpose="to delete your account"
      />
    </>
  );
}
