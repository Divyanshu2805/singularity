package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.intelligence.dto.usage.LastRequestUsage;
import com.vibecraft.intelligence.dto.usage.PlanLimitsResponse;
import com.vibecraft.intelligence.dto.usage.UsageReservation;
import com.vibecraft.intelligence.dto.usage.UsageTodayResponse;
import com.vibecraft.intelligence.dto.usage.UsageRecord;
import com.vibecraft.intelligence.entity.UsageEvent;
import com.vibecraft.intelligence.entity.UsageLog;
import com.vibecraft.common.error.QuotaExceededException;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.repository.UsageEventRepository;
import com.vibecraft.intelligence.repository.UsageLogRepository;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.service.UsageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Token metering and the daily budget gate.
 *
 * <p>Handles: claiming a conservative reservation against the daily counter before an AI call starts and truing it
 * up to the real cost afterward, writing a call's usage to both the counter and the ledger directly for calls that
 * are not separately reserved, reading today's usage alongside the plan's ceilings and the counts workspace-service
 * owns, and working out when the allowance refills.
 *
 * <p>Both the reservation and the plain record path update the counter with a single atomic UPDATE rather than a
 * read-modify-write - see {@link UsageLogRepository} - because a check-then-write on the same row is exactly how two
 * concurrent calls each pass a budget check that only one of them should have, or how one call's increment overwrites
 * another's. The reservation is deliberately sized off {@code spring.ai.openai.chat.options.max-tokens}, the model's
 * own hard output ceiling, capped at the plan's entire daily allowance so a plan smaller than that ceiling (the free
 * tier's 5,000 tokens/day is well under the model's 32,000-token cap) can still make its one call rather than being
 * permanently refused. The true cost - almost always far less than the reservation - is trued up afterward by
 * {@code reconcileBudget}, which also accepts a null actual usage: that releases the reservation in full, for a call
 * that produced nothing chargeable.
 *
 * <p>A plan flagged as unlimited is let through before the numeric check, which still records for display - without
 * that, an unlimited plan would be throttled like any other. The refusal is a 402 carrying the limit, the amount used
 * and the refill time, so the client can offer an upgrade rather than show an error.
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
    private final int reservationTokens;

    public UsageServiceImpl(UsageLogRepository usageLogRepository, UsageEventRepository usageEventRepository,
                             AccountServiceClient accountServiceClient, WorkspaceServiceClient workspaceServiceClient,
                             AuthUtil authUtil, @Value("${spring.ai.openai.chat.options.max-tokens}") int reservationTokens) {
        this.usageLogRepository = usageLogRepository;
        this.usageEventRepository = usageEventRepository;
        this.accountServiceClient = accountServiceClient;
        this.workspaceServiceClient = workspaceServiceClient;
        this.authUtil = authUtil;
        this.reservationTokens = reservationTokens;
    }

    @Override
    @Transactional
    public void recordTokenUsage(UsageRecord record) {
        if (record == null || record.userId() == null || record.totalTokens() <= 0) {
            return;
        }
        LocalDate today = LocalDate.now();
        usageLogRepository.ensureRowExists(record.userId(), today);
        usageLogRepository.addTokens(record.userId(), today, record.totalTokens());
        saveUsageEvent(record);
    }

    @Override
    @Transactional
    public UsageReservation reserveBudget() {
        Long userId = authUtil.getCurrentUserId();
        LocalDate today = LocalDate.now();
        PlanDto plan = accountServiceClient.getPlanLimits(userId);

        if (plan.unlimitedAi()) {
            return new UsageReservation(userId, today, 0);
        }

        int amount = Math.min(reservationTokens, plan.maxTokensPerDay());
        usageLogRepository.ensureRowExists(userId, today);
        int reserved = usageLogRepository.tryReserve(userId, today, amount, plan.maxTokensPerDay());
        if (reserved == 0) {
            throw new QuotaExceededException(
                    "You've used today's AI allowance on the " + plan.name() + " plan. "
                            + "It refills at midnight, or you can upgrade for a bigger daily budget.",
                    QuotaExceededException.Reason.DAILY_TOKENS,
                    plan.maxTokensPerDay(), tokensUsedToday(userId), dailyResetInstant(), plan.name());
        }
        return new UsageReservation(userId, today, amount);
    }

    @Override
    @Transactional
    public void reconcileBudget(UsageReservation reservation, UsageRecord actualUsage) {
        if (reservation == null || reservation.tokens() == 0) {
            return;
        }
        int actualTotal = actualUsage == null ? 0 : Math.max(0, actualUsage.totalTokens());
        int delta = actualTotal - reservation.tokens();
        if (delta != 0) {
            usageLogRepository.adjust(reservation.userId(), reservation.date(), delta);
        }
        if (actualUsage != null && actualTotal > 0) {
            saveUsageEvent(actualUsage);
        }
    }

    private void saveUsageEvent(UsageRecord record) {
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

        return new UsageTodayResponse(
                tokensUsedToday(userId),
                plan.maxTokensPerDay(),
                workspaceServiceClient.getRunningPreviewCount(userId),
                plan.maxPreviews(),
                workspaceServiceClient.getOwnedProjectCount(userId),
                plan.maxProjects(),
                dailyResetInstant(),
                plan.name(),
                projectTokens,
                lastRequest);
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
        return usageLogRepository.findByUserIdAndDate(userId, LocalDate.now())
                .map(UsageLog::getTokensUsed)
                .orElse(0);
    }
}
