package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.usage.PlanLimitsResponse;
import com.vibecraft.intelligence.dto.usage.UsageRecord;
import com.vibecraft.intelligence.dto.usage.UsageTodayResponse;

/**
 * Token metering and the daily budget gate.
 *
 * <p>Handles: recording one call's usage to both the daily counter and the ledger, reading today's usage against the
 * plan, the plan limits on their own, refusing a request that has no allowance left, and working out when the
 * allowance refills.
 *
 * <p>The budget check is what every AI entry point calls before starting, and it raises a 402 carrying the numbers
 * rather than a generic error, so the client can offer an upgrade.
 */
public interface UsageService {

    UsageTodayResponse getTodayUsageOfUser(Long projectId);

    PlanLimitsResponse getCurrentSubscriptionLimitsOfUser();

    void recordTokenUsage(UsageRecord record);

    void assertWithinDailyTokenBudget();

    java.time.Instant dailyResetInstant();
}
