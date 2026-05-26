package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.subscription.PlanLimitsResponse;
import com.java.vibecraft.dto.subscription.UsageTodayResponse;
import com.java.vibecraft.entity.Plan;
import com.java.vibecraft.entity.Subscription;
import com.java.vibecraft.entity.UsageLog;
import com.java.vibecraft.enums.SubscriptionStatus;
import com.java.vibecraft.repository.SubscriptionRepository;
import com.java.vibecraft.repository.UsageLogRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.SubscriptionService;
import com.java.vibecraft.service.UsageService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class UsageServiceImpl implements UsageService {

    private final UsageLogRepository usageLogRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final AuthUtil authUtil;

    @Override
    public void recordTokenUsage(Long userId, int actualTokens) {
        LocalDate today = LocalDate.now();

        UsageLog todayLog = usageLogRepository.findByUserIdAndDate(userId, today).
                orElseGet(() -> createNewDailyLog(userId, today));

        todayLog.setTokensUsed(todayLog.getTokensUsed() + actualTokens);
        usageLogRepository.save(todayLog);
    }

    @Override
    public UsageTodayResponse getTodayUsageOfUser() {
        Long userId = authUtil.getCurrentUserId();
        LocalDate today = LocalDate.now();

        int tokensUsed = usageLogRepository.findByUserIdAndDate(userId, today)
                .map(UsageLog::getTokensUsed)
                .orElse(0);

        Plan plan = getActivePlan(userId);

        int tokensLimit = plan != null && plan.getMaxTokensPerDay() != null
                ? plan.getMaxTokensPerDay()
                : SubscriptionService.FREE_TIER_DAILY_TOKENS;
        int previewsLimit = plan != null && plan.getMaxPreviews() != null ? plan.getMaxPreviews() : 0;

        // No live preview execution exists yet (see CLAUDE.md's Preview-is-schema-only note),
        // so nothing can actually be running.
        return new UsageTodayResponse(tokensUsed, tokensLimit, 0, previewsLimit);
    }

    @Override
    public PlanLimitsResponse getCurrentSubscriptionLimitsOfUser() {
        Plan plan = getActivePlan(authUtil.getCurrentUserId());

        if (plan == null) {
            return new PlanLimitsResponse("Free", SubscriptionService.FREE_TIER_DAILY_TOKENS,
                    SubscriptionService.FREE_TIER_PROJECTS_ALLOWED, false);
        }

        return new PlanLimitsResponse(plan.getName(), plan.getMaxTokensPerDay(), plan.getMaxProjects(), plan.getUnlimitedAi());
    }

    private Plan getActivePlan(Long userId) {
        return subscriptionRepository.findByUserIdAndStatusIn(userId, Set.of(
                        SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.TRIALING))
                .map(Subscription::getPlan)
                .orElse(null);
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
