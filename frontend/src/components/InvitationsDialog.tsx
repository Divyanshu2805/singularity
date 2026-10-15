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
 * It is drawn like the undo dialog (RestoreDialog): it drops in (.dialog-pop), the header carries the glowing icon
 * tile, and each invitation is a card that rises in turn. The panel is as tall as its content up to a cap, and the
 * list scrolls inside it beyond that. Nothing in it takes the focus
 * when it opens; the first button used to, and a gold ring around Decline read as the suggested answer.
 */
import { Mail, MailOpen } from "lucide-react";
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
      <div className="app-rise flex flex-col items-center gap-2 px-4 py-8 text-center">
        <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
          <MailOpen className="h-5 w-5" />
        </span>
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
        className="dialog-pop flex max-h-[min(34rem,calc(100dvh-2rem))] w-[calc(100vw-1.5rem)] flex-col gap-4 rounded-[24px] p-5 sm:max-w-lg sm:p-7"
      >
        <DialogHeader className="shrink-0 flex-row items-start gap-3.5 space-y-0 text-left sm:pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/[0.07] text-primary shadow-[0_0_24px_-8px_hsl(var(--primary)/0.6)]">
            <Mail className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-xl leading-tight">Project invites</DialogTitle>
            <DialogDescription className="mt-1.5 leading-snug">Projects other people have invited you to.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-gutter:stable]">
          {open && <InvitationsBody onAccepted={() => onOpenChange(false)} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
