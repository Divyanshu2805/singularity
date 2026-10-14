/**
 * The invitations addressed to the signed-in person, and answering one.
 *
 * Handles: reading the list, accepting an invitation (which adds the project to the person's list and opens it),
 * declining one, saying which one is being answered so its buttons can wait, and a toast when an answer fails.
 *
 * It is shared by the panel invitations are answered in (opened from the account menu or the dashboard notice's View
 * button; the notice also answers a single invitation itself), the sidebar's count and the dashboard's toast (InvitationNotice), so all read one cached list. The list is
 * asked for when one of them mounts and again after an answer, never on a timer.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api, isAuthenticated } from "@/lib/api";
import type { ProjectInvitation } from "@/lib/types";

export const INVITATIONS_QUERY_KEY = ["project-invitations"] as const;

export interface Invitations {
  invitations: ProjectInvitation[];
  isLoading: boolean;
  busyProjectId: number | null;
  answer: (invitation: ProjectInvitation, accept: boolean) => Promise<void>;
}

export function useInvitations(onAccepted?: () => void): Invitations {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busyProjectId, setBusyProjectId] = useState<number | null>(null);

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: INVITATIONS_QUERY_KEY,
    queryFn: () => api.getMyInvitations(),
    enabled: isAuthenticated(),
  });

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
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
      if (accept) {
        onAccepted?.();
        navigate(`/projects/${invitation.projectId}`);
      }
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

  return { invitations, isLoading, busyProjectId, answer };
}
