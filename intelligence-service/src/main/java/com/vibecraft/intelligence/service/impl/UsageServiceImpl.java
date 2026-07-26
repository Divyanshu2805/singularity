package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.intelligence.dto.usage.LastRequestUsage;
import com.vibecraft.intelligence.dto.usage.PlanLimitsResponse;
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
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Token metering and the daily budget gate.
 *
 * <p>Handles: writing each call to both the daily counter and the ledger in one transaction, reading today's usage
 * alongside the plan's ceilings and the counts workspace-service owns, and refusing a request whose daily allowance
 * is spent.
 *
 * <p>A plan flagged as unlimited is let through before the numeric check, which is still set for display - without
 * that, an unlimited plan would be throttled like any other. The refusal is a 402 carrying the limit, the amount used
 * and the refill time, so the client can offer an upgrade rather than show an error.
 *
 * <p>The refill instant is computed in the same zone the daily rows are bucketed by, or it would promise a refill at
 * the wrong moment.
 */
@Service
@RequiredArgsConstructor
public class UsageServiceImpl implements UsageService {

    private final UsageLogRepository usageLogRepository;
    private final UsageEventRepository usageEventRepository;
    private final AccountServiceClient accountServiceClient;
    private final WorkspaceServiceClient workspaceServiceClient;
    private final AuthUtil authUtil;

    @Override
    @Transactional
    public void recordTokenUsage(UsageRecord record) {
        if (record == null || record.userId() == null || record.totalTokens() <= 0) {
            return;
        }
        LocalDate today = LocalDate.now();

        UsageLog todayLog = usageLogRepository.findByUserIdAndDate(record.userId(), today).
                orElseGet(() -> createNewDailyLog(record.userId(), today));

        todayLog.setTokensUsed(todayLog.getTokensUsed() + record.totalTokens());
        usageLogRepository.save(todayLog);

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
    public void assertWithinDailyTokenBudget() {
        Long userId = authUtil.getCurrentUserId();
        PlanDto plan = accountServiceClient.getPlanLimits(userId);

        if (plan.unlimitedAi()) {
            return;
        }

        int limit = plan.maxTokensPerDay();
        int used = tokensUsedToday(userId);
        if (used < limit) {
            return;
        }

        throw new QuotaExceededException(
                "You've used today's AI allowance on the " + plan.name() + " plan. "
                        + "It refills at midnight, or you can upgrade for a bigger daily budget.",
                QuotaExceededException.Reason.DAILY_TOKENS,
                limit, used, dailyResetInstant(), plan.name());
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

    private UsageLog createNewDailyLog(Long userId, LocalDate date) {
        UsageLog newLog = UsageLog.builder()
                .userId(userId)
                .date(date)
                .tokensUsed(0)
                .build();
        return usageLogRepository.save(newLog);
    }
}
