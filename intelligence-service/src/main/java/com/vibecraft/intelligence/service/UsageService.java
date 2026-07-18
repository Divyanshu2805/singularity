package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.usage.PlanLimitsResponse;
import com.vibecraft.intelligence.dto.usage.UsageTodayResponse;

public interface UsageService {

    /** {@code projectId} optional - adds that project's share of today when given. */
    UsageTodayResponse getTodayUsageOfUser(Long projectId);

    PlanLimitsResponse getCurrentSubscriptionLimitsOfUser();

    /**
     * Bills one AI call: adds it to the caller's daily counter (what quotas read) and appends it to the usage
     * ledger (what insights read), in one transaction so the two can't disagree about whether it happened.
     */
    void recordTokenUsage(com.vibecraft.intelligence.dto.usage.UsageRecord record);

    /**
     * Refuses the call if the caller has already spent today's token allowance.
     *
     * <p><b>Pre-flight, and deliberately so.</b> It answers "have you got anything left?", not "will this
     * particular request fit" - nobody knows what a response will cost until it has been generated. Someone on
     * their last hundred tokens can therefore overshoot by one response. The alternative, cutting a build off
     * part-way through, would waste the tokens already spent and leave the project half-written; every metered
     * AI product makes the same trade.
     *
     * @throws com.vibecraft.common.error.QuotaExceededException mapped to 402 by the global handler
     */
    void assertWithinDailyTokenBudget();

    /** The instant today's allowance refills: the next midnight in the server's zone. */
    java.time.Instant dailyResetInstant();
}
