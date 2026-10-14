/**
 * The invitation rows the Project invites panel draws.
 *
 * Handles: one row per project someone has invited the signed-in person to - the project's letter, who sent it and what
 * it lets them do, a quiet Decline chip and a primary Accept (InvitationRows).
 *
 * An invitation gives no access until it is accepted: the project is not in the person's list and cannot be opened.
 * Reading and answering are hooks/use-invitations; the panel that shows these rows is InvitationsDialog, opened from the
 * account menu or from the View button of the dashboard's toast (InvitationNotice).
 */
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import type { Invitations } from "@/hooks/use-invitations";
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
