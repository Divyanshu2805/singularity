package com.vibecraft.account.service.impl;

import com.vibecraft.account.config.PlanSeeder;
import com.vibecraft.account.dto.subscription.PlanResponse;
import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.vibecraft.account.entity.Plan;
import com.vibecraft.account.entity.Subscription;
import com.vibecraft.account.entity.User;
import com.vibecraft.account.enums.SubscriptionStatus;
import com.vibecraft.account.mapper.PlanMapper;
import com.vibecraft.account.mapper.SubscriptionMapper;
import com.vibecraft.account.repository.PlanRepository;
import com.vibecraft.account.repository.SubscriptionRepository;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.account.security.AuthUtil;
import com.vibecraft.account.service.SubscriptionService;
import com.vibecraft.common.error.ResourceNotFoundException;
import jakarta.transaction.Transactional;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class SubscriptionServiceImpl implements SubscriptionService {

    SubscriptionRepository subscriptionRepository;
    UserRepository userRepository;
    PlanRepository planRepository;
    AuthUtil authUtil;
    SubscriptionMapper subscriptionMapper;
    PlanMapper planMapper;

    /** The statuses that still entitle someone to their plan. Cancelled and incomplete do not. */
    private static final Set<SubscriptionStatus> ENTITLING = Set.of(
            SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.TRIALING);

    @Override
    public SubscriptionResponse getCurrentSubscription() {
        return subscriptionRepository.findByUserIdAndStatusIn(authUtil.getCurrentUserId(), ENTITLING)
                .map(subscriptionMapper::toSubscriptionResponse)
                .orElseGet(this::freeSubscription);
    }

    private SubscriptionResponse freeSubscription() {
        return new SubscriptionResponse(freePlanResponse(), null, null, null, false, true);
    }

    private PlanResponse freePlanResponse() {
        return planRepository.findByNameIgnoreCase(PlanSeeder.FREE_PLAN_NAME)
                .map(planMapper::toPlanResponse)
                .orElseGet(() -> new PlanResponse(null, PlanSeeder.FREE_PLAN_NAME, null,
                        FREE_TIER_PROJECTS_ALLOWED, FREE_TIER_DAILY_TOKENS, 0, false,
                        "Free", 0, "inr", "month", true));
    }

    @Override
    public Plan getActivePlan(Long userId) {
        return getActiveSubscription(userId).map(Subscription::getPlan).orElse(null);
    }

    @Override
    public Optional<Subscription> getActiveSubscription(Long userId) {
        return subscriptionRepository.findByUserIdAndStatusIn(userId, ENTITLING);
    }

    @Override
    public void activateSubscription(Long userId, Long planId, String subscriptionId, String customerId) {

        boolean exists = subscriptionRepository.existsByStripeSubscriptionId(subscriptionId);
        if (exists) return;

        User user = getUser(userId);
        Plan plan = getPlan(planId);

        Subscription subscription = Subscription.builder()
                .user(user)
                .plan(plan)
                .stripeSubscriptionId(subscriptionId)
                .status(SubscriptionStatus.INCOMPLETE)
                .build();

        subscriptionRepository.save(subscription);
    }

    @Override
    @Transactional
    public void updateSubscription(String gatewaySubscriptionId, SubscriptionStatus status, Instant periodStart,
                                   Instant periodEnd, Boolean cancelAtPeriodEnd, Long planId) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);

        boolean hasSubscriptionUpdated = false;

        if (status != null && status != subscription.getStatus()) {
            subscription.setStatus(status);
            hasSubscriptionUpdated = true;
        }

        if (periodStart != null && !periodStart.equals(subscription.getCurrentPeriodStart())) {
            subscription.setCurrentPeriodStart(periodStart);
            hasSubscriptionUpdated = true;
        }

        if (periodEnd != null && !periodEnd.equals(subscription.getCurrentPeriodEnd())) {
            subscription.setCurrentPeriodEnd(periodEnd);
            hasSubscriptionUpdated = true;
        }

        if (cancelAtPeriodEnd != null && !java.util.Objects.equals(cancelAtPeriodEnd, subscription.getCancelAtPeriodEnd())) {
            subscription.setCancelAtPeriodEnd(cancelAtPeriodEnd);
            hasSubscriptionUpdated = true;
        }

        if (planId != null && !planId.equals(subscription.getPlan().getId())) {
            Plan newPlan = getPlan(planId);
            subscription.setPlan(newPlan);
            hasSubscriptionUpdated = true;
        }

        if (hasSubscriptionUpdated) {
            log.debug("Subscription has been updated: {}", gatewaySubscriptionId);
            subscriptionRepository.save(subscription);
        }
    }

    @Override
    public void cancelSubscription(String gatewaySubscriptionId) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);
        subscription.setStatus(SubscriptionStatus.CANCELED);
        subscriptionRepository.save(subscription);
    }

    @Override
    public void renewSubscriptionPeriod(String gatewaySubscriptionId, Instant periodStart, Instant periodEnd) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);

        Instant newStart = periodStart != null ? periodStart : subscription.getCurrentPeriodEnd();
        subscription.setCurrentPeriodStart(newStart);
        subscription.setCurrentPeriodEnd(periodEnd);

        if (subscription.getStatus() == SubscriptionStatus.PAST_DUE || subscription.getStatus() == SubscriptionStatus.INCOMPLETE) {
            subscription.setStatus(SubscriptionStatus.ACTIVE);
        }

        subscriptionRepository.save(subscription);
    }

    @Override
    public void markSubscriptionPastDue(String gatewaySubscriptionId) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);

        if (subscription.getStatus() == SubscriptionStatus.PAST_DUE) {
            log.debug("Subscription is already past due, gatewaySubscriptionId: {}", gatewaySubscriptionId);
            return;
        }

        subscription.setStatus(SubscriptionStatus.PAST_DUE);
        subscriptionRepository.save(subscription);
    }

    @Override
    public int projectAllowance(Long userId) {
        Plan plan = getActivePlan(userId);
        return plan != null && plan.getMaxProjects() != null ? plan.getMaxProjects() : FREE_TIER_PROJECTS_ALLOWED;
    }

    @Override
    public int previewAllowance(Long userId) {
        Plan plan = getActivePlan(userId);
        return plan != null && plan.getMaxPreviews() != null ? plan.getMaxPreviews() : FREE_TIER_PREVIEWS;
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId.toString()));
    }

    private Plan getPlan(Long planId) {
        return planRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("Plan", planId.toString()));
    }

    private Subscription getSubscription(String gatewaySubscriptionId) {
        return subscriptionRepository.findByStripeSubscriptionId(gatewaySubscriptionId).orElseThrow(() ->
                new ResourceNotFoundException("Subscription", gatewaySubscriptionId));
    }
}
