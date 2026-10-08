package com.singularity.intelligence.service;

import com.singularity.intelligence.dto.usage.PlanLimitsResponse;
import com.singularity.intelligence.dto.usage.UsageRecord;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.dto.usage.UsageTodayResponse;
import com.singularity.intelligence.enums.UsageFeature;

/**
 * Token metering and the daily budget gate.
 *
 * <p>Handles: admitting an AI call against what is left of a user's daily allowance and holding part of it for the
 * call, watching a call's estimated spend while it runs and saying when it has reached what the user has left,
 * charging each call's real cost to the daily counter and the ledger when it ends, recording usage directly for a
 * call that was never admitted through a hold, reading today's usage against the plan, the plan limits on their own,
 * and working out when the allowance refills.
 *
 * <p>{@code reserveBudget} is what every AI entry point calls before starting, and it raises a 402 carrying the
 * numbers rather than a generic error, so the client can offer an upgrade. It replaces a plain "is there room right
 * now" check: two concurrent calls both asking that question can both hear "yes" before either has spent anything,
 * so the check has to also claim the room, atomically, or it does not actually bound concurrent spend.
 *
 * <p>The two calls a build turn makes while it runs both answer {@code true} for "the budget is spent", so that
 * nothing listening - a stub in a test, a reservation nothing tracks - is ever taken to mean "stop".
 */
public interface UsageService {
    UsageTodayResponse getTodayUsageOfUser(Long projectId);

    PlanLimitsResponse getCurrentSubscriptionLimitsOfUser();

    void recordTokenUsage(UsageRecord record);

    UsageReservation reserveBudget(UsageFeature feature);

    boolean exceedsBudget(UsageReservation reservation, int estimatedTokensOfCall);

    boolean settleCall(UsageReservation reservation, UsageRecord actualUsage, int neededForAnotherCall);

    void reconcileBudget(UsageReservation reservation, UsageRecord actualUsage);

    java.time.Instant dailyResetInstant();
}
