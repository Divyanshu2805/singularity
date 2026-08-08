package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.usage.PlanLimitsResponse;
import com.vibecraft.intelligence.dto.usage.UsageRecord;
import com.vibecraft.intelligence.dto.usage.UsageReservation;
import com.vibecraft.intelligence.dto.usage.UsageTodayResponse;

/**
 * Token metering and the daily budget gate.
 *
 * <p>Handles: claiming a conservative slice of a user's daily allowance before an AI call starts and truing it up
 * once the real cost is known, recording a call's usage to both the daily counter and the ledger directly (for calls
 * that are not separately gated), reading today's usage against the plan, the plan limits on their own, and working
 * out when the allowance refills.
 *
 * <p>{@code reserveBudget} is what every AI entry point calls before starting, and it raises a 402 carrying the
 * numbers rather than a generic error, so the client can offer an upgrade. It replaces a plain "is there room right
 * now" check: two concurrent calls both asking that question can both hear "yes" before either has spent anything,
 * so the check has to also claim the room, atomically, or it does not actually bound concurrent spend.
 */
public interface UsageService {

    UsageTodayResponse getTodayUsageOfUser(Long projectId);

    PlanLimitsResponse getCurrentSubscriptionLimitsOfUser();

    void recordTokenUsage(UsageRecord record);

    UsageReservation reserveBudget();

    void reconcileBudget(UsageReservation reservation, UsageRecord actualUsage);

    java.time.Instant dailyResetInstant();
}
