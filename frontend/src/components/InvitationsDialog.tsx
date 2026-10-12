/**
 * The panel of project invitations opened from the account menu.
 *
 * Handles: listing every invitation waiting for the signed-in person with Accept and Decline on each, saying so when
 * there are none, and closing itself when one is accepted, since accepting opens that project.
 *
 * It is the same list the dashboard shows (InvitationRows, hooks/use-invitations), reachable from anywhere in the
 * app: the dashboard's list only shows on the dashboard, and someone working in a project had no way to see that
 * they had been invited to another. It is drawn as the project's Learn panel is - the app's dialog with an icon
 * tile beside its title - and nothing is asked for until it is opened.
 *
 * The panel is one fixed size: the list scrolls inside it however many invitations there are, and the empty and
 * loading states stand in the same box, so it does not change shape between them. Nothing in it takes the focus
 * when it opens; the first button used to, and a gold ring around Decline read as the suggested answer.
 */
import { Mail } from "lucide-react";
import { InvitationRows } from "@/components/InvitationsList";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInvitations } from "@/hooks/use-invitations";

function InvitationsBody({ onAccepted }: { onAccepted: () => void }) {
  const { invitations, isLoading, busyProjectId, answer } = useInvitations(onAccepted);

  if (isLoading) {
    return (
      <div className="space-y-3 py-1" aria-label="Loading invitations">
        {[62, 48].map((width) => (
          <div key={width} className="flex items-center gap-3 px-2">
            <div className="app-skeleton h-8 w-8 rounded-full" />
            <div className="app-skeleton h-3.5 rounded" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium">No invitations waiting</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          When someone invites you to their project, it shows here. It gives you nothing until you accept it.
        </p>
      </div>
    );
  }

  return (
    <InvitationRows invitations={invitations} busyProjectId={busyProjectId} answer={answer} />
  );
}

export function InvitationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="flex h-[min(26rem,calc(100dvh-2rem))] w-[calc(100vw-1.5rem)] flex-col gap-3.5 rounded-[22px] p-5 sm:max-w-lg sm:p-6"
      >
        <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 text-left sm:pr-9">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-primary">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <DialogTitle>Project invites</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">Projects other people have invited you to.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-gutter:stable]">
          {open && <InvitationsBody onAccepted={() => onOpenChange(false)} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
