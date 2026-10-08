package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.PlanDto;
import com.singularity.intelligence.dto.usage.LastRequestUsage;
import com.singularity.intelligence.dto.usage.PlanLimitsResponse;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.dto.usage.UsageTodayResponse;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.dto.usage.UsageRecord;
import com.singularity.intelligence.entity.UsageEvent;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.repository.UsageEventRepository;
import com.singularity.intelligence.repository.UsageLogRepository;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.service.UsageService;
import com.singularity.intelligence.service.impl.BudgetHolds.Hold;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Token metering and the daily budget gate.
 *
 * <p>Handles: admitting an AI call when enough of the daily allowance is left and holding part of it for the call;
 * letting a running call's hold grow while there is allowance to grow into, and saying when there is none; charging
 * each call's real cost to the counter and the ledger when it ends; writing usage directly for calls that were never
 * admitted through a hold; reading today's usage - what has been charged plus what calls in progress are estimated to
 * have spent so far - alongside the plan's ceilings and the counts workspace-service owns; and working out when the
 * allowance refills.
 *
 * <p>The day's counter holds what has been spent and nothing else. A call's claim on the allowance is a hold, kept
 * in memory ({@link BudgetHolds}), and the rule every admission and every growth of a hold keeps is: spent, plus
 * everything held, never exceeds the plan's limit. Checking that and changing a hold happen under the user's lock, and
 * so does the write that charges a finished call, which commits before the lock is given up - a hold released while
 * its charge was still uncommitted would be room that looked free twice.
 *
 * <p>It used to work differently, and both things people noticed came from that. A build added a flat sixty thousand
 * tokens to the counter before it began and corrected the counter when its first call ended, so the meter leapt at
 * the start of every build and fell back on a refresh - and a plan with a hundred thousand tokens refused a build
 * once forty thousand were spent, with the meter showing well over half the day left. And nothing looked at the
 * allowance again once a turn was admitted: the correction and every later call of the turn were added without a
 * ceiling, so one long turn could finish thousands of tokens past the limit.
 *
 * <p>A build is now admitted when {@code usage.build-minimum-tokens} are free - enough to send the prompt and get
 * something back - and is granted up to {@code usage.build-reservation-tokens} of what is free. The idea interview and
 * the code lens need and are granted far less ({@code usage.light-minimum-tokens}, {@code
 * usage.light-reservation-tokens}). A minimum larger than the plan's whole allowance is capped at the allowance, so a
 * small plan can still make its call. While a build call runs, its estimated spend is reported here; past what it
 * was granted, the hold grows into whatever is still free, and when nothing is, the answer is that the budget is
 * spent and the turn stops there. The estimate shown and enforced mid-call is replaced by the provider's own count
 * when the call ends.
 *
 * <p>A plan flagged as unlimited is never refused and never stopped, but its calls are tracked and charged like any
 * other, so its usage is still there to read. They used to be let through with an empty reservation that the charge
 * then skipped, which recorded nothing at all.
 *
 * <p>The figure the meter reads is capped at the limit. An estimate can be a little short of the provider's count, so
 * a call that ran to the very end of the allowance may be charged slightly past it; the ledger keeps the true figure,
 * and the meter says the allowance is used up, which is what is true for the user.
 *
 * <p>The refill instant is computed in the same zone the daily rows are bucketed by, or it would promise a refill at
 * the wrong moment.
 */
@Service
public class UsageServiceImpl implements UsageService {

    private final UsageLogRepository usageLogRepository;
    private final UsageEventRepository usageEventRepository;
    private final AccountServiceClient accountServiceClient;
    private final WorkspaceServiceClient workspaceServiceClient;
    private final AuthUtil authUtil;
    private final BudgetHolds holds;
    private final TransactionTemplate transactions;
    private final int reservationTokens;
    private final int lightReservationTokens;
    private final int buildMinimumTokens;
    private final int lightMinimumTokens;

    public UsageServiceImpl(UsageLogRepository usageLogRepository, UsageEventRepository usageEventRepository,
                             AccountServiceClient accountServiceClient, WorkspaceServiceClient workspaceServiceClient,
                             AuthUtil authUtil, BudgetHolds holds, TransactionTemplate transactions,
                             @Value("${usage.build-reservation-tokens}") int reservationTokens,
                             @Value("${usage.light-reservation-tokens}") int lightReservationTokens,
                             @Value("${usage.build-minimum-tokens}") int buildMinimumTokens,
                             @Value("${usage.light-minimum-tokens}") int lightMinimumTokens) {
        this.usageLogRepository = usageLogRepository;
        this.usageEventRepository = usageEventRepository;
        this.accountServiceClient = accountServiceClient;
        this.workspaceServiceClient = workspaceServiceClient;
        this.authUtil = authUtil;
        this.holds = holds;
        this.transactions = transactions;
        this.reservationTokens = reservationTokens;
        this.lightReservationTokens = lightReservationTokens;
        this.buildMinimumTokens = buildMinimumTokens;
        this.lightMinimumTokens = lightMinimumTokens;
    }

    @Override
    @Transactional
    public void recordTokenUsage(UsageRecord record) {
        if (record == null || record.userId() == null || record.totalTokens() <= 0) {
            return;
        }
        charge(record);
    }

    @Override
    public UsageReservation reserveBudget(UsageFeature feature) {
        Long userId = authUtil.getCurrentUserId();
        LocalDate today = LocalDate.now();
        PlanDto plan = accountServiceClient.getPlanLimits(userId);
        boolean isBuild = feature == UsageFeature.BUILD;
        int wanted = isBuild ? reservationTokens : lightReservationTokens;

        if (plan.unlimitedAi()) {
            Hold hold = holds.open(userId, wanted, Integer.MAX_VALUE, true, wanted);
            return new UsageReservation(userId, today, hold.granted, hold.id);
        }

        int limit = plan.maxTokensPerDay();
        int minimum = Math.min(isBuild ? buildMinimumTokens : lightMinimumTokens, limit);
        synchronized (holds.lockFor(userId)) {
            int used = tokensUsedToday(userId);
            int free = limit - used - holds.heldFor(userId);
            if (free < minimum) {
                throw new QuotaExceededException(
                        refusal(plan, limit - used, isBuild),
                        QuotaExceededException.Reason.DAILY_TOKENS,
                        limit, Math.min(limit, used), dailyResetInstant(), plan.name());
            }
            Hold hold = holds.open(userId, wanted, limit, false, Math.min(wanted, free));
            return new UsageReservation(userId, today, hold.granted, hold.id);
        }
    }

    private static String refusal(PlanDto plan, int left, boolean isBuild) {
        if (left <= 0) {
            return "You've used today's AI allowance on the " + plan.name() + " plan. "
                    + "It refills at midnight, or you can upgrade for a bigger daily budget.";
        }
        return "There isn't enough of today's AI allowance left on the " + plan.name() + " plan for "
                + (isBuild ? "another build" : "this") + ". It refills at midnight, or you can upgrade for a bigger "
                + "daily budget.";
    }

    @Override
    public boolean exceedsBudget(UsageReservation reservation, int estimatedTokensOfCall) {
        Hold hold = reservation == null ? null : holds.find(reservation.holdId());
        if (hold == null) {
            return false;
        }
        int estimate = Math.max(0, estimatedTokensOfCall);
        synchronized (holds.lockFor(hold.userId)) {
            hold.inFlight = estimate;
            if (hold.unlimited || estimate <= hold.granted) {
                return false;
            }
            int free = Math.max(0, hold.limit - tokensUsedToday(hold.userId) - holds.heldFor(hold.userId));
            int needed = estimate - hold.granted;
            hold.granted += Math.min(free, Math.max(needed, hold.wanted / 2));
            if (estimate <= hold.granted) {
                return false;
            }
            hold.inFlight = hold.granted;
            return true;
        }
    }

    @Override
    public boolean settleCall(UsageReservation reservation, UsageRecord actualUsage, int neededForAnotherCall) {
        if (reservation == null) {
            return false;
        }
        boolean isChargeable = actualUsage != null && actualUsage.totalTokens() > 0;
        Hold hold = holds.find(reservation.holdId());
        if (hold == null) {
            if (isChargeable) {
                transactions.executeWithoutResult(status -> charge(actualUsage));
            }
            return false;
        }
        synchronized (holds.lockFor(hold.userId)) {
            if (isChargeable) {
                transactions.executeWithoutResult(status -> charge(actualUsage));
            }
            hold.inFlight = 0;
            if (hold.unlimited) {
                return false;
            }
            hold.granted = Math.max(0, hold.granted - (isChargeable ? actualUsage.totalTokens() : 0));
            int free = Math.max(0, hold.limit - tokensUsedToday(hold.userId) - holds.heldFor(hold.userId));
            hold.granted += Math.min(free, Math.max(0, hold.wanted - hold.granted));
            return hold.granted < neededForAnotherCall;
        }
    }

    @Override
    public void reconcileBudget(UsageReservation reservation, UsageRecord actualUsage) {
        if (reservation == null) {
            return;
        }
        try {
            settleCall(reservation, actualUsage, 0);
        } finally {
            holds.close(reservation.holdId());
        }
    }

    private void charge(UsageRecord record) {
        LocalDate today = LocalDate.now();
        usageLogRepository.ensureRowExists(record.userId(), today);
        usageLogRepository.addTokens(record.userId(), today, record.totalTokens());
        usageEventRepository.save(UsageEvent.builder()
                .userId(record.userId())
                .projectId(record.projectId())
                .feature(record.feature().name())
                .inputTokens(Math.max(0, record.inputTokens()))
                .outputTokens(Math.max(0, record.outputTokens()))
                .totalTokens(record.totalTokens())
                .createdAt(Instant.now())
                .build());
    }

    @Override
    public UsageTodayResponse getTodayUsageOfUser(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        Instant startOfToday = LocalDate.now(ZoneId.systemDefault()).atStartOfDay(ZoneId.systemDefault()).toInstant();
        Long projectTokens = projectId == null ? null
                : usageEventRepository.sumForProjectBetween(userId, projectId, startOfToday, dailyResetInstant());
        var lastRequest = usageEventRepository.findFirstByUserIdOrderByCreatedAtDescIdDesc(userId)
                .map(e -> new LastRequestUsage(e.getFeature(), e.getProjectId(),
                        e.getInputTokens(), e.getOutputTokens(), e.getTotalTokens(), e.getCreatedAt()))
                .orElse(null);
        PlanDto plan = accountServiceClient.getPlanLimits(userId);

        long spent = (long) tokensUsedToday(userId) + holds.inFlightFor(userId);
        int shown = (int) (plan.unlimitedAi() ? Math.min(Integer.MAX_VALUE, spent) : Math.min(plan.maxTokensPerDay(), spent));

        return new UsageTodayResponse(
                shown,
                plan.maxTokensPerDay(),
                workspaceServiceClient.getRunningPreviewCount(userId),
                plan.maxPreviews(),
                workspaceServiceClient.getOwnedProjectCount(userId),
                plan.maxProjects(),
                dailyResetInstant(),
                plan.name(),
                projectTokens,
                lastRequest,
                plan.unlimitedAi() ? 0 : Math.min(buildMinimumTokens, plan.maxTokensPerDay()));
    }

    @Override
    public PlanLimitsResponse getCurrentSubscriptionLimitsOfUser() {
        PlanDto plan = accountServiceClient.getPlanLimits(authUtil.getCurrentUserId());
        return new PlanLimitsResponse(plan.name(), plan.maxTokensPerDay(), plan.maxProjects(), plan.unlimitedAi());
    }

    @Override
    public Instant dailyResetInstant() {
        ZoneId zone = ZoneId.systemDefault();
        return LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant();
    }

    private int tokensUsedToday(Long userId) {
        return usageLogRepository.findTokensUsed(userId, LocalDate.now()).orElse(0);
    }
}
