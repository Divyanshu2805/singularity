package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.subscription.PlanLimitsResponse;
import com.java.vibecraft.dto.subscription.UsageTodayResponse;
import com.java.vibecraft.dto.usage.UsageRecord;
import com.java.vibecraft.entity.Plan;
import com.java.vibecraft.entity.UsageEvent;
import com.java.vibecraft.entity.UsageLog;
import com.java.vibecraft.error.QuotaExceededException;
import com.java.vibecraft.repository.UsageEventRepository;
import com.java.vibecraft.repository.UsageLogRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.SubscriptionService;
import com.java.vibecraft.service.UsageService;
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
    private final SubscriptionService subscriptionService;
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
                .map(e -> new com.java.vibecraft.dto.usage.LastRequestUsage(e.getFeature(), e.getProjectId(),
                        e.getInputTokens(), e.getOutputTokens(), e.getTotalTokens(), e.getCreatedAt()))
                .orElse(null);
        Plan plan = subscriptionService.getActivePlan(userId);
        int previewsLimit = plan != null && plan.getMaxPreviews() != null ? plan.getMaxPreviews() : 0;

        // No live preview execution exists yet (see CLAUDE.md's Preview-is-schema-only note),
        // so nothing can actually be running.
        return new UsageTodayResponse(
                tokensUsedToday(userId),
                tokenAllowance(plan),
                0,
                previewsLimit,
                subscriptionService.projectsOwned(userId),
                subscriptionService.projectAllowance(userId),
                dailyResetInstant(),
                planName(plan),
                projectTokens,
                lastRequest);
    }

    @Override
    public PlanLimitsResponse getCurrentSubscriptionLimitsOfUser() {
        Plan plan = subscriptionService.getActivePlan(authUtil.getCurrentUserId());

        if (plan == null) {
            return new PlanLimitsResponse("Free", SubscriptionService.FREE_TIER_DAILY_TOKENS,
                    SubscriptionService.FREE_TIER_PROJECTS_ALLOWED, false);
        }

        return new PlanLimitsResponse(plan.getName(), plan.getMaxTokensPerDay(), plan.getMaxProjects(), plan.getUnlimitedAi());
    }

    @Override
    public void assertWithinDailyTokenBudget() {
        Long userId = authUtil.getCurrentUserId();
        Plan plan = subscriptionService.getActivePlan(userId);

        int limit = tokenAllowance(plan);
        int used = tokensUsedToday(userId);
        if (used < limit) {
            return;
        }

        throw new QuotaExceededException(
                "You've used today's AI allowance on the " + planName(plan) + " plan. "
                        + "It refills at midnight, or you can upgrade for a bigger daily budget.",
                QuotaExceededException.Reason.DAILY_TOKENS,
                limit, used, dailyResetInstant(), planName(plan));
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

    /**
     * The daily token ceiling. {@code Plan.unlimitedAi} is deliberately not consulted: the per-plan token
     * number is the real limit on every plan (2026-09-16 product decision), and honouring the flag here would
     * quietly make those numbers meaningless.
     */
    private int tokenAllowance(Plan plan) {
        return plan != null && plan.getMaxTokensPerDay() != null
                ? plan.getMaxTokensPerDay()
                : SubscriptionService.FREE_TIER_DAILY_TOKENS;
    }

    private int tokensUsedToday(Long userId) {
        return usageLogRepository.findByUserIdAndDate(userId, LocalDate.now())
                .map(UsageLog::getTokensUsed)
                .orElse(0);
    }

    private String planName(Plan plan) {
        return plan != null ? plan.getName() : "Free";
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
