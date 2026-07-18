package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.intelligence.dto.usage.PlanLimitsResponse;
import com.vibecraft.intelligence.dto.usage.UsageTodayResponse;
import com.vibecraft.intelligence.dto.usage.UsageRecord;
import com.vibecraft.intelligence.entity.UsageEvent;
import com.vibecraft.intelligence.entity.UsageLog;
import com.vibecraft.common.error.QuotaExceededException;
import com.vibecraft.intelligence.feign.AccountServiceClient;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.repository.UsageEventRepository;
import com.vibecraft.intelligence.repository.UsageLogRepository;
import com.vibecraft.intelligence.security.AuthUtil;
import com.vibecraft.intelligence.service.UsageService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

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
                .map(e -> new com.vibecraft.intelligence.dto.usage.LastRequestUsage(e.getFeature(), e.getProjectId(),
                        e.getInputTokens(), e.getOutputTokens(), e.getTotalTokens(), e.getCreatedAt()))
                .orElse(null);
        PlanDto plan = accountServiceClient.getPlanLimits(userId);

        // No live preview execution exists yet (see CLAUDE.md's Preview-is-schema-only note),
        // so nothing can actually be running. Project ownership is workspace-service's own count - the
        // allowance is Account's, the count is Workspace's, same split every quota check in this codebase uses.
        return new UsageTodayResponse(
                tokensUsedToday(userId),
                plan.maxTokensPerDay(),
                0,
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
        // account-service's endpoint already folds in the free-tier fallback - never null, so the null-check
        // branch this used to need is gone.
        PlanDto plan = accountServiceClient.getPlanLimits(authUtil.getCurrentUserId());
        return new PlanLimitsResponse(plan.name(), plan.maxTokensPerDay(), plan.maxProjects(), plan.unlimitedAi());
    }

    @Override
    public void assertWithinDailyTokenBudget() {
        Long userId = authUtil.getCurrentUserId();
        PlanDto plan = accountServiceClient.getPlanLimits(userId);

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

    /**
     * Midnight tonight, in the zone the daily rows are bucketed by. {@code recordTokenUsage} keys a
     * {@code UsageLog} on {@code LocalDate.now()}, which is the JVM default zone - forced to Asia/Kolkata in
     * {@code VibecraftApplication.main()} - so the countdown has to be computed against that same zone or
     * it would promise a refill at the wrong moment.
     */
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
