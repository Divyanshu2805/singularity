/**
 * The caller's subscription, today's usage and what their plan allows, as one thing components can read.
 *
 * Handles: fetching both, deriving the token quota and the project allowance from them, refreshing after a plan
 * change, and listing the plan catalogue for the pricing page.
 *
 * Usage is given a short staleness window because it changes on every streamed response, so a cached figure goes
 * stale fast.
 */
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isAuthenticated } from "@/lib/api";
import { toQuota, type Quota } from "@/lib/billing";
import type { Subscription, UsageToday } from "@/lib/types";

export const SUBSCRIPTION_QUERY_KEY = ["subscription"] as const;
export const USAGE_QUERY_KEY = ["usage", "today"] as const;

const USAGE_STALE_MS = 15_000;

export interface Billing {
  subscription: Subscription | undefined;
  usage: UsageToday | undefined;
  quota: Quota | null;
  isLoading: boolean;
  projects: { used: number; limit: number; isExhausted: boolean } | null;
  refresh: () => Promise<void>;
}

export function useBilling(): Billing {
  const queryClient = useQueryClient();
  const signedIn = isAuthenticated();

  const subscriptionQuery = useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: () => api.getMySubscription(),
    enabled: signedIn,
  });

  const usageQuery = useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: () => api.getUsageToday(),
    enabled: signedIn,
    staleTime: USAGE_STALE_MS,
  });

  const usage = usageQuery.data;
  const quota = useMemo(() => toQuota(usage), [usage]);

  const projects = useMemo(() => {
    if (!usage) return null;
    const limit = usage.projectsLimit ?? 0;
    const used = usage.projectsUsed ?? 0;
    return { used, limit, isExhausted: used >= limit };
  }, [usage]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY }),
    ]);
  }, [queryClient]);

  return {
    subscription: subscriptionQuery.data,
    usage,
    quota,
    projects,
    isLoading: signedIn && (subscriptionQuery.isLoading || usageQuery.isLoading),
    refresh,
  };
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: () => api.getPlans(),
    staleTime: 5 * 60_000,
  });
}
