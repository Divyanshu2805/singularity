/**
 * The invitations addressed to the signed-in person, on the dashboard.
 *
 * Handles: listing each project someone has invited them to with who sent it and what it lets them do, accepting one
 * (which opens the project) and declining one. It renders nothing at all when there are none, so the dashboard looks
 * the same as before for everyone who has no invitation waiting.
 *
 * An invitation gives no access until it is accepted here: the project is not in the person's list and cannot be
 * opened. The list is asked for once when the dashboard loads, like the projects beside it, and again after an
 * answer. It is drawn as the dashboard's glass panel with the app's own buttons, and takes the place the projects
 * panel has under the prompt: it rises into the hero by the same amount and leaves that much room beneath itself, so
 * the projects panel below overlaps empty space instead of this one.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrbitSpinner } from "@/components/app/OrbitSpinner";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { roleOffer } from "@/lib/members";
import type { ProjectInvitation } from "@/lib/types";

export function InvitationsList() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [busyProjectId, setBusyProjectId] = useState<number | null>(null);

    const { data: invitations = [] } = useQuery({
        queryKey: ["project-invitations"],
        queryFn: () => api.getMyInvitations(),
    });

    if (invitations.length === 0) return null;

    const answer = async (invitation: ProjectInvitation, accept: boolean) => {
        if (busyProjectId !== null) return;
        setBusyProjectId(invitation.projectId);
        try {
            if (accept) {
                await api.acceptInvitation(String(invitation.projectId));
                await queryClient.invalidateQueries({ queryKey: ["projects"] });
            } else {
                await api.declineInvitation(String(invitation.projectId));
            }
            await queryClient.invalidateQueries({ queryKey: ["project-invitations"] });
            if (accept) navigate(`/projects/${invitation.projectId}`);
        } catch (error) {
            toast({
                title: accept ? "Couldn't accept the invitation" : "Couldn't decline the invitation",
                description: error instanceof Error ? error.message : undefined,
                variant: "destructive",
            });
        } finally {
            setBusyProjectId(null);
        }
    };

    return (
        <section aria-label="Invitations" className="relative z-10 mx-auto -mt-12 w-full max-w-6xl shrink-0 px-4 pb-16 sm:px-6">
            <div className="app-glass app-rise rounded-[22px] p-4 sm:p-5">
                <p className="sidebar-label mb-2">Invitations</p>
                <ul className="space-y-1">
                    {invitations.map((invitation) => {
                        const isBusy = busyProjectId === invitation.projectId;
                        return (
                            <li key={invitation.projectId} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                                    <Mail aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{invitation.projectName}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {invitation.invitedByName ? `${invitation.invitedByName} invited you` : "You were invited"} to{" "}
                                        {roleOffer(invitation.role)} this project
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busyProjectId !== null}
                                        onClick={() => answer(invitation, false)}
                                        className="h-8 px-3 text-xs"
                                    >
                                        Decline
                                    </Button>
                                    <Button
                                        size="sm"
                                        disabled={busyProjectId !== null}
                                        onClick={() => answer(invitation, true)}
                                        className="h-8 gap-1.5 px-3.5 text-xs"
                                    >
                                        {isBusy && <OrbitSpinner className="h-3.5 w-3.5" />}
                                        Accept
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}
