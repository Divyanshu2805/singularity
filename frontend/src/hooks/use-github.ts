/**
 * A project's standing with GitHub, and the actions that change it.
 *
 * Handles: reading whether GitHub is available here, whether the signed-in person has connected it and which
 * repository the project has been pushed to; pushing; forgetting the repository; and disconnecting the account.
 *
 * It asks once when the project opens and again after each action, and never on a timer. Whether there are changes
 * not yet pushed moves with the project's files, so the project page asks again (by this key) whenever a response
 * ends or a file is saved or restored; without that the Push changes button showed only after a reload. A push is
 * only ever begun by the button.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectGitHub } from "@/lib/types";

export const gitHubQueryKey = (projectId: string) => ["github", projectId] as const;

export interface ProjectGitHubActions {
  state: ProjectGitHub | undefined;
  push: (input: { name?: string; privateRepo: boolean; message?: string }) => Promise<ProjectGitHub>;
  forget: () => Promise<void>;
  disconnect: () => Promise<void>;
  isPushing: boolean;
  isForgetting: boolean;
  isDisconnecting: boolean;
}

export function useProjectGitHub(projectId: string): ProjectGitHubActions {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: gitHubQueryKey(projectId),
    queryFn: () => api.getProjectGitHub(projectId),
    enabled: !!projectId,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["github"] });

  const pushMutation = useMutation({
    mutationFn: (input: { name?: string; privateRepo: boolean; message?: string }) =>
      api.pushToGitHub(projectId, input.name, input.privateRepo, input.message),
    onSuccess: (next) => queryClient.setQueryData(gitHubQueryKey(projectId), next),
    onError: () => void refresh(),
  });

  const forgetMutation = useMutation({
    mutationFn: () => api.forgetGitHubRepository(projectId),
    onSuccess: refresh,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.disconnectGitHub(),
    onSuccess: refresh,
  });

  return {
    state: query.data,
    push: pushMutation.mutateAsync,
    forget: forgetMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    isPushing: pushMutation.isPending,
    isForgetting: forgetMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
  };
}
