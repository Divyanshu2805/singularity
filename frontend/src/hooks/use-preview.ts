import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { USAGE_QUERY_KEY } from "@/hooks/use-billing";
import type { Preview } from "@/lib/types";

export const previewQueryKey = (projectId: string) => ["preview", projectId] as const;
export const MY_PREVIEWS_QUERY_KEY = ["previews", "mine"] as const;

/** Fast while starting, so the checklist ticks along; slow once running, where each poll is just "still here". */
const STARTING_POLL_MS = 2_000;
/** Also the heartbeat: the server stops a preview nobody has asked about for 30 minutes. */
const RUNNING_POLL_MS = 60_000;

export interface ProjectPreview {
  preview: Preview | null | undefined;
  isLoaded: boolean;
  start: () => Promise<Preview>;
  restart: () => Promise<Preview>;
  stop: () => Promise<void>;
  isStarting: boolean;
  isStopping: boolean;
  /** The last start/restart failure (a 402 plan limit, a 503 with no free runner) until the next attempt. */
  startError: unknown;
  resetStartError: () => void;
}

/**
 * A project's live preview. Polls only while the Preview tab is showing (`isActive`) - that polling doubles as the
 * heartbeat, so a preview left unviewed is stopped by the server after its idle timeout and frees the runner.
 */
export function useProjectPreview(projectId: string, isActive: boolean): ProjectPreview {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: previewQueryKey(projectId),
    queryFn: () => api.getPreview(projectId),
    enabled: !!projectId,
    refetchInterval: (q) => {
      if (!isActive) return false;
      const status = (q.state.data as Preview | null | undefined)?.status;
      if (status === "CREATING") return STARTING_POLL_MS;
      if (status === "RUNNING") return RUNNING_POLL_MS;
      return false;
    },
  });

  const afterChange = useCallback(
    (preview?: Preview) => {
      if (preview) queryClient.setQueryData(previewQueryKey(projectId), preview);
      else void queryClient.invalidateQueries({ queryKey: previewQueryKey(projectId) });
      // The running count is part of today's usage and of the plan-limit list.
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
