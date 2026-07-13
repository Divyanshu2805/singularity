import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isAuthenticated } from "@/lib/api";
import { toQuota, type Quota } from "@/lib/billing";
import type { Subscription, UsageToday } from "@/lib/types";

export const SUBSCRIPTION_QUERY_KEY = ["subscription"] as const;
export const USAGE_QUERY_KEY = ["usage", "today"] as const;

/** Usage changes every time a response streams, so a cached figure goes stale fast. */
const USAGE_STALE_MS = 15_000;

export interface Billing {
  subscription: Subscription | undefined;
  usage: UsageToday | undefined;
  /** Derived token allowance - null until usage has loaded. */
  quota: Quota | null;
  isLoading: boolean;
  /** How many projects they own against their plan's ceiling. */
  projects: { used: number; limit: number; isExhausted: boolean } | null;
  /** Re-reads both after something that could have changed them (a checkout, a new project). */
  refresh: () => Promise<void>;
}

/**
 * What the signed-in account is allowed to do, and how much of it they've used.
 *
 * <p>Two queries rather than one endpoint returning both: a subscription changes when someone pays, maybe
 * monthly, while usage moves on every single response. Folding them together would mean either re-fetching
 * the plan constantly or showing a stale meter.
 *
 * <p>Safe to call on a signed-out page - both queries are simply disabled, so the pricing page can use the
 * same hook to decide whether to say "Upgrade" or "Sign in".
 */
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

/** The catalogue. Separate from {@link useBilling} because it is public and rarely changes. */
export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: () => api.getPlans(),
    staleTime: 5 * 60_000,
  });
}
