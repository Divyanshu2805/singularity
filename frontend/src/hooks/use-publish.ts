/**
 * A project's published app: its state, and the actions that change it.
 *
 * Handles: polling the state (quickly while a build runs, slowly while the app is live, not at all when there is
 * nothing to watch), publishing and updating, unpublishing, switching the sharing of the code, and refreshing the project
 * list when a build finishes or the app comes down so the "Published" mark on every card follows.
 *
 * How often to poll is lib/publish's (publishPollInterval). Nothing here starts a build by itself: a build costs the
 * owner a runner and is only ever begun by pressing the button.
 */
import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { publishPollInterval } from "@/lib/publish";
import type { PublishState } from "@/lib/types";

export const publishQueryKey = (projectId: string) => ["publish", projectId] as const;

export interface ProjectPublish {
  state: PublishState | undefined;
  isLoaded: boolean;
  publish: (slug?: string) => Promise<PublishState>;
  unpublish: () => Promise<void>;
  setShared: (shared: boolean) => Promise<PublishState>;
  isPublishing: boolean;
  isUnpublishing: boolean;
  isSharing: boolean;
  publishError: unknown;
  resetPublishError: () => void;
}

export function useProjectPublish(projectId: string, isOpen: boolean): ProjectPublish {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: publishQueryKey(projectId),
    queryFn: () => api.getPublish(projectId),
    enabled: !!projectId,
    refetchInterval: (q) => publishPollInterval(q.state.data as PublishState | undefined, isOpen),
  });

  const refreshProjects = useCallback(() => queryClient.invalidateQueries({ queryKey: ["projects"] }), [queryClient]);

  const lastSeen = useRef<{ live: boolean; building: boolean } | null>(null);
  const state = query.data;
  useEffect(() => {
    if (!state) return;
    const now = { live: state.live, building: state.build?.status === "BUILDING" };
    const before = lastSeen.current;
    lastSeen.current = now;
    if (before && (before.live !== now.live || (before.building && !now.building))) void refreshProjects();
  }, [state, refreshProjects]);

  const publishMutation = useMutation({
    mutationFn: (slug?: string) => api.publish(projectId, slug),
    onSuccess: (next) => queryClient.setQueryData(publishQueryKey(projectId), next),
  });

  const unpublishMutation = useMutation({
    mutationFn: () => api.unpublish(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: publishQueryKey(projectId) });
      void refreshProjects();
    },
  });

  const shareMutation = useMutation({
    mutationFn: (shared: boolean) => api.setCodeShared(projectId, shared),
    onSuccess: (next) => queryClient.setQueryData(publishQueryKey(projectId), next),
  });

  const { reset } = publishMutation;

  return {
    state,
    isLoaded: query.isFetched,
    publish: publishMutation.mutateAsync,
    unpublish: unpublishMutation.mutateAsync,
    setShared: shareMutation.mutateAsync,
    isPublishing: publishMutation.isPending,
    isUnpublishing: unpublishMutation.isPending,
    isSharing: shareMutation.isPending,
    publishError: publishMutation.error,
    resetPublishError: useCallback(() => reset(), [reset]),
  };
}
