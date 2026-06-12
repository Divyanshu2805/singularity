package com.java.vibecraft.service;

import com.java.vibecraft.dto.subscription.CheckoutRequest;
import com.java.vibecraft.dto.subscription.CheckoutResponse;
import com.java.vibecraft.dto.subscription.PortalResponse;
import com.java.vibecraft.dto.subscription.SubscriptionResponse;
import com.java.vibecraft.entity.Plan;
import com.java.vibecraft.enums.SubscriptionStatus;

import java.time.Instant;

public interface SubscriptionService {

    /**
     * What someone gets before they ever pay. Shared with {@code UsageServiceImpl} and written into the free
     * plan row by {@code PlanSeeder}, so enforcement and the pricing page can't disagree.
     *
     * <p>These were 100 projects and 50,000 tokens/day until 2026-09-16 - more projects than Pro and as many
     * tokens as Business, which made both paid plans pointless. A free tier is a trial: enough to build one
     * small thing and see it work.
     */
    int FREE_TIER_PROJECTS_ALLOWED = 1;
    int FREE_TIER_DAILY_TOKENS = 5_000;

    /** How many live previews a free-tier user may run at once - see {@code projectAllowance}'s same reasoning. */
    int FREE_TIER_PREVIEWS = 1;

    SubscriptionResponse getCurrentSubscription();

    void activateSubscription(Long userId, Long planId, String subscriptionId, String customerId);

    void updateSubscription(String gatewaySubscriptionId, SubscriptionStatus status, Instant periodStart, Instant periodEnd, Boolean cancelAtPeriodEnd, Long planId);

    void cancelSubscription(String gatewaySubscriptionId);

    void renewSubscriptionPeriod(String gatewaySubscriptionId, Instant periodStart, Instant periodEnd);

    void markSubscriptionPastDue(String gatewaySubscriptionId);

    boolean canCreateNewProject();

    /**
     * The plan a user is entitled to right now, or null if they're on the free tier. One place that decides
     * which subscription statuses still count - {@code UsageServiceImpl} had its own private copy of that
     * rule, which was free to drift from the one gating projects.
     */
    Plan getActivePlan(Long userId);

    /** The subscription that currently entitles this user to a paid plan, if any - same status rule as above. */
    java.util.Optional<com.java.vibecraft.entity.Subscription> getActiveSubscription(Long userId);

    /** How many projects this user may own, from their plan or the free constant. */
    int projectAllowance(Long userId);

    /** How many live previews this user may run at once, from their plan or the free constant. */
    int previewAllowance(Long userId);

    /** How many they own now - non-deleted, and owned rather than shared with them. */
    int projectsOwned(Long userId);
}
