/**
 * A project's live preview: its state, and the actions that change it.
 *
 * Handles: polling the preview, asking about it at once when something says it may have changed, starting,
 * restarting and stopping it, and keeping the usage meter and the cross-project preview list in step afterwards.
 *
 * How often to poll is lib/preview's (previewPollInterval): fast while starting or taking a change in, slow once
 * running and level. The slow poll is also the heartbeat: the server stops a preview nobody has asked about for long
 * enough.
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { USAGE_QUERY_KEY } from "@/hooks/use-billing";
import { previewPollInterval } from "@/lib/preview";
import type { Preview } from "@/lib/types";

export const previewQueryKey = (projectId: string) => ["preview", projectId] as const;
export const MY_PREVIEWS_QUERY_KEY = ["previews", "mine"] as const;

export interface ProjectPreview {
  preview: Preview | null | undefined;
  isLoaded: boolean;
  refresh: () => Promise<Preview | null | undefined>;
  start: () => Promise<Preview>;
  restart: () => Promise<Preview>;
  stop: () => Promise<void>;
  isStarting: boolean;
  isStopping: boolean;
  startError: unknown;
  resetStartError: () => void;
}

export function useProjectPreview(projectId: string, isActive: boolean): ProjectPreview {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: previewQueryKey(projectId),
    queryFn: () => api.getPreview(projectId),
    enabled: !!projectId,
    refetchInterval: (q) => previewPollInterval(q.state.data as Preview | null | undefined, isActive),
  });
  const { refetch } = query;
  const refresh = useCallback(() => refetch().then((result) => result.data), [refetch]);

  const afterChange = useCallback(
    (preview?: Preview) => {
      if (preview) queryClient.setQueryData(previewQueryKey(projectId), preview);
      else void queryClient.invalidateQueries({ queryKey: previewQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: MY_PREVIEWS_QUERY_KEY });
    },
    [queryClient, projectId]
  );

  const startMutation = useMutation({
    mutationFn: () => api.startPreview(projectId),
    onSuccess: (preview) => afterChange(preview),
  });

  const restartMutation = useMutation({
    mutationFn: () => api.restartPreview(projectId),
    onSuccess: (preview) => afterChange(preview),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopPreview(projectId),
    onSuccess: () => afterChange(),
  });

  const { reset: resetStart } = startMutation;
  const { reset: resetRestart } = restartMutation;

  return {
    preview: query.data,
    isLoaded: query.isFetched,
    refresh,
    start: startMutation.mutateAsync,
    restart: restartMutation.mutateAsync,
    stop: stopMutation.mutateAsync,
    isStarting: startMutation.isPending || restartMutation.isPending,
    isStopping: stopMutation.isPending,
    startError: startMutation.error ?? restartMutation.error,
    resetStartError: useCallback(() => {
      resetStart();
      resetRestart();
    }, [resetStart, resetRestart]),
  };
}
