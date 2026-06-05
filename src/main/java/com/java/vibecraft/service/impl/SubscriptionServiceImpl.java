package com.java.vibecraft.service.impl;

import com.java.vibecraft.config.PlanSeeder;
import com.java.vibecraft.dto.subscription.PlanResponse;
import com.java.vibecraft.dto.subscription.SubscriptionResponse;
import com.java.vibecraft.entity.Plan;
import com.java.vibecraft.entity.Subscription;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.enums.SubscriptionStatus;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.mapper.PlanMapper;
import com.java.vibecraft.mapper.SubscriptionMapper;
import com.java.vibecraft.repository.PlanRepository;
import com.java.vibecraft.repository.ProjectMemberRepository;
import com.java.vibecraft.repository.SubscriptionRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.SubscriptionService;
import jakarta.transaction.Transactional;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
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
    ProjectMemberRepository projectMemberRepository;

    /** The statuses that still entitle someone to their plan. Cancelled and incomplete do not. */
    private static final Set<SubscriptionStatus> ENTITLING = Set.of(
            SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.TRIALING);

    /**
     * Always answers with a plan. Someone who has never paid gets the free plan rather than an empty shell -
     * this used to map {@code new Subscription()}, so the response came back with a null plan, null status and
     * null everything, leaving every caller to infer "free" from an absence.
     */
    @Override
    public SubscriptionResponse getCurrentSubscription() {
        return subscriptionRepository.findByUserIdAndStatusIn(authUtil.getCurrentUserId(), ENTITLING)
                .map(subscriptionMapper::toSubscriptionResponse)
                .orElseGet(this::freeSubscription);
    }

    private SubscriptionResponse freeSubscription() {
        return new SubscriptionResponse(freePlanResponse(), null, null, null, false, true);
    }

    /**
     * The seeded free plan. Synthesised from the constants if the row is somehow missing, so a failed seed
     * degrades to the right limits rather than a null plan the UI can't render.
     */
    private PlanResponse freePlanResponse() {
        return planRepository.findByNameIgnoreCase(PlanSeeder.FREE_PLAN_NAME)
                .map(planMapper::toPlanResponse)
                .orElseGet(() -> new PlanResponse(null, PlanSeeder.FREE_PLAN_NAME, null,
                        FREE_TIER_PROJECTS_ALLOWED, FREE_TIER_DAILY_TOKENS, 0, false,
                        "Free", 0, "inr", "month", true));
    }

    /** The plan a user is entitled to right now, or null when they're on the free tier. */
    @Override
    public Plan getActivePlan(Long userId) {
        return getActiveSubscription(userId).map(Subscription::getPlan).orElse(null);
    }

    @Override
    public java.util.Optional<Subscription> getActiveSubscription(Long userId) {
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

        if(status != null && status != subscription.getStatus()) {
            subscription.setStatus(status);
            hasSubscriptionUpdated = true;
        }

        if(periodStart != null && !periodStart.equals(subscription.getCurrentPeriodStart())) {
            subscription.setCurrentPeriodStart(periodStart);
            hasSubscriptionUpdated = true;
        }

        if(periodEnd != null && !periodEnd.equals(subscription.getCurrentPeriodEnd())) {
            subscription.setCurrentPeriodEnd(periodEnd);
            hasSubscriptionUpdated = true;
        }

        // Objects.equals, not !=: both sides are boxed Booleans, and != compares references - correct only while
        // every Boolean happens to come from the valueOf cache. Cancel and resume both depend on this flag.
        if(cancelAtPeriodEnd != null && !java.util.Objects.equals(cancelAtPeriodEnd, subscription.getCancelAtPeriodEnd())) {
            subscription.setCancelAtPeriodEnd(cancelAtPeriodEnd);
            hasSubscriptionUpdated = true;
        }

        if(planId != null && !planId.equals(subscription.getPlan().getId())) {
            Plan newPlan = getPlan(planId);
            subscription.setPlan(newPlan);
            hasSubscriptionUpdated = true;
        }

        if(hasSubscriptionUpdated) {
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

        if(subscription.getStatus() == SubscriptionStatus.PAST_DUE || subscription.getStatus() == SubscriptionStatus.INCOMPLETE) {
            subscription.setStatus(SubscriptionStatus.ACTIVE);
        }

        subscriptionRepository.save(subscription);
    }

    @Override
    public void markSubscriptionPastDue(String gatewaySubscriptionId) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);

        if(subscription.getStatus() == SubscriptionStatus.PAST_DUE) {
            log.debug("Subscription is already past due, gatewaySubscriptionId: {}", gatewaySubscriptionId);
            return;
        }

        subscription.setStatus(SubscriptionStatus.PAST_DUE);
        subscriptionRepository.save(subscription);

        // Notify user via email..
    }

    @Override
    public int projectAllowance(Long userId) {
        Plan plan = getActivePlan(userId);
        return plan != null && plan.getMaxProjects() != null ? plan.getMaxProjects() : FREE_TIER_PROJECTS_ALLOWED;
    }

    @Override
    public int projectsOwned(Long userId) {
        return projectMemberRepository.countProjectOwnedByUser(userId);
    }

    @Override
    public boolean canCreateNewProject() {
        Long userId = authUtil.getCurrentUserId();
        return projectsOwned(userId) < projectAllowance(userId);
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
