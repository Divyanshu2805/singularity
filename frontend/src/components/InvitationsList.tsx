/**
 * The invitations addressed to the signed-in person: the rows, and the dashboard's panel of them.
 *
 * Handles: one row per project someone has invited them to - the project's letter, who sent it and what it lets them
 * do, a quiet Decline chip and a primary Accept (InvitationRows); and the dashboard's own panel around those rows (InvitationsList), which renders nothing
 * at all when there are none, so the dashboard looks the same as before for everyone who has no invitation waiting.
 *
 * An invitation gives no access until it is accepted: the project is not in the person's list and cannot be opened.
 * Reading and answering are hooks/use-invitations, shared with the panel the account menu opens
 * (InvitationsDialog), which draws the same rows. The dashboard's panel is the dashboard's glass panel with the
 * app's own buttons, and takes the place the projects panel has under the prompt: it rises into the hero by the same
 * amount and leaves that much room beneath itself, so the projects panel below overlaps empty space instead of this
 * one.
 */
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { useInvitations, type Invitations } from "@/hooks/use-invitations";
import { roleOffer } from "@/lib/members";

export function InvitationRows({ invitations, busyProjectId, answer }: Pick<Invitations, "invitations" | "busyProjectId" | "answer">) {
    return (
        <ul className="space-y-1.5">
            {invitations.map((invitation) => {
                const isBusy = busyProjectId === invitation.projectId;
                return (
                    <li key={invitation.projectId} className="app-field flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5">
                        <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-semibold uppercase text-foreground/80 ring-1 ring-inset ring-white/10"
                        >
                            {invitation.projectName.trim().charAt(0) || <Mail className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{invitation.projectName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                                {invitation.invitedByName ? `From ${invitation.invitedByName}` : "An invitation"} · to {roleOffer(invitation.role)}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <button
                                type="button"
                                disabled={busyProjectId !== null}
                                onClick={() => answer(invitation, false)}
                                className="app-chip inline-flex h-7 items-center rounded-full px-3 text-xs text-foreground/80 disabled:pointer-events-none disabled:opacity-50"
                            >
                                Decline
                            </button>
                            <Button
                                size="sm"
                                disabled={busyProjectId !== null}
                                onClick={() => answer(invitation, true)}
                                className="h-7 gap-1.5 rounded-full px-3.5 text-xs"
                            >
                                {isBusy && <OrbitSpinner className="h-3 w-3" />}
                                Accept
                            </Button>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export function InvitationsList() {
    const { invitations, busyProjectId, answer } = useInvitations();

    if (invitations.length === 0) return null;

    return (
        <section aria-label="Invitations" className="relative z-10 mx-auto -mt-12 w-full max-w-6xl shrink-0 px-4 pb-16 sm:px-6">
            <div className="app-glass app-rise rounded-[22px] p-4 sm:p-5">
                <p className="sidebar-label mb-2">Invitations</p>
                <InvitationRows invitations={invitations} busyProjectId={busyProjectId} answer={answer} />
            </div>
        </section>
    );
}
