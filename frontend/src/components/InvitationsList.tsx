/**
 * The invitation rows the Project invites panel draws.
 *
 * Handles: one row per project someone has invited the signed-in person to - the project's letter, who sent it and what
 * it lets them do, and the two answers as the app's chip buttons (InvitationRows). Each invitation is a card that rises
 * in turn, with its project's letter in the glowing tile colour and the buttons on a line of their own so a long
 * project name or sender is never squeezed by them.
 *
 * An invitation gives no access until it is accepted: the project is not in the person's list and cannot be opened.
 * Reading and answering are hooks/use-invitations; the panel that shows these rows is InvitationsDialog, opened from the
 * account menu or from the View button of the dashboard's toast (InvitationNotice).
 */
import type { CSSProperties } from "react";
import { Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import type { Invitations } from "@/hooks/use-invitations";
import { roleOffer } from "@/lib/members";

export function InvitationRows({ invitations, busyProjectId, answer }: Pick<Invitations, "invitations" | "busyProjectId" | "answer">) {
    return (
        <ul className="flex flex-col gap-2.5">
            {invitations.map((invitation, index) => {
                const isBusy = busyProjectId === invitation.projectId;
                return (
                    <li
                        key={invitation.projectId}
                        className="app-field app-rise flex flex-col gap-3 rounded-2xl p-3.5"
                        style={{ "--i": index } as CSSProperties}
                    >
                        <div className="flex items-center gap-3">
                            <span
                                aria-hidden="true"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.07] text-sm font-semibold uppercase text-primary"
                            >
                                {invitation.projectName.trim().charAt(0) || <Mail className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold" title={invitation.projectName}>{invitation.projectName}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {invitation.invitedByName ? `From ${invitation.invitedByName}` : "An invitation"}
                                </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                                to {roleOffer(invitation.role)}
                            </span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="chip"
                                size="sm"
                                disabled={busyProjectId !== null}
                                onClick={() => answer(invitation, false)}
                                className="app-chip-danger border-red-400/40 text-red-300"
                            >
                                Decline
                            </Button>
                            <Button
                                type="button"
                                variant="chip"
                                size="sm"
                                disabled={busyProjectId !== null}
                                onClick={() => answer(invitation, true)}
                                className="gap-1.5"
                            >
                                {isBusy ? <OrbitSpinner className="h-3 w-3" /> : <Check className="h-3.5 w-3.5" />}
                                Accept
                            </Button>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
