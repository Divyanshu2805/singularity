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
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.account.service.SubscriptionService;
import com.vibecraft.common.error.ResourceNotFoundException;
import jakarta.transaction.Transactional;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * Subscription state and entitlement.
 *
 * <p>Handles: reading the caller's current subscription and falling back to the free plan when there is none,
 * resolving the plan and subscription a user is entitled to, and applying the state changes the webhooks drive -
 * activation, a field-by-field update that writes only when something actually changed, cancellation, renewal (which
 * also lifts a past-due or incomplete subscription back to active) and marking past due.
 *
 * <p>Entitlement is a small state machine, not a flat status set: ACTIVE and TRIALING always entitle; PAST_DUE
 * entitles only within {@code billing.past-due-grace-days} of when it started (isCurrentlyEntitling), after which a
 * user reads back as free without needing another webhook; CANCELED, INCOMPLETE, UNPAID and PAUSED never entitle.
 * Every entitlement question in the system funnels through {@link #getActiveSubscription}.
 *
 * <p>Two database constraints back activation: stripe_subscription_id is globally unique, and a user can hold at
 * most one non-terminal (non-CANCELED) subscription row at a time. activateSubscription treats a violation of the
 * first as an idempotent duplicate delivery and a violation of the second as a refusal to open a second concurrent
 * subscription for the same user - neither throws past this method.
 *
 * <p>Every mutator compares its caller-supplied {@code eventTime} against the row's own lastEventAt and is a no-op
 * if the incoming event is older - a delayed or out-of-order webhook (a stale customer.subscription.updated arriving
 * after a later customer.subscription.deleted already applied) can never regress state that a newer event already
 * moved past. A {@code null} eventTime (a fresh live re-read from Stripe, not itself racing another event) always
 * applies and its own "now" becomes the new lastEventAt, so any later legitimate webhook - whose event-creation time
 * is necessarily after that live read - still applies normally afterward.
 *
 * <p>pastDueGraceDays carries its own Java-side default (not just the {@code @Value} default expression) because
 * this class is deliberately plain-JUnit, never {@code @SpringBootTest} - a test that builds it with {@code new}
 * needs the same value production gets, since {@code @Value} field injection never runs outside a Spring container.
 */
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
    Clock clock;

    @NonFinal
    @Value("${billing.past-due-grace-days:7}")
    private int pastDueGraceDays = 7;

    private static final Set<SubscriptionStatus> ENTITLING_CANDIDATES = Set.of(
            SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.TRIALING);

    @Override
    public SubscriptionResponse getCurrentSubscription() {
        return getActiveSubscription(authUtil.getCurrentUserId())
                .map(subscriptionMapper::toSubscriptionResponse)
                .orElseGet(this::freeSubscription);
    }

    private SubscriptionResponse freeSubscription() {
        return new SubscriptionResponse(freePlanResponse(), null, null, null, false, true, false);
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
        return subscriptionRepository.findByUserIdAndStatusIn(userId, ENTITLING_CANDIDATES)
                .filter(this::isCurrentlyEntitling);
    }

    private boolean isCurrentlyEntitling(Subscription subscription) {
        if (subscription.getStatus() != SubscriptionStatus.PAST_DUE) {
            return true;
        }
        Instant since = subscription.getPastDueSince();
        return since != null && since.isAfter(clock.instant().minus(Duration.ofDays(pastDueGraceDays)));
    }

    @Override
    public void activateSubscription(Long userId, Long planId, String subscriptionId, String customerId, Instant eventTime) {

        if (subscriptionRepository.existsByStripeSubscriptionId(subscriptionId)) {
            log.debug("Subscription {} already activated, ignoring duplicate activation", subscriptionId);
            return;
        }

        User user = getUser(userId);
        Plan plan = getPlan(planId);

        Subscription subscription = Subscription.builder()
                .user(user)
                .plan(plan)
                .stripeSubscriptionId(subscriptionId)
                .status(SubscriptionStatus.INCOMPLETE)
                .lastEventAt(eventTime)
                .build();

        try {
            subscriptionRepository.save(subscription);
        } catch (DataIntegrityViolationException e) {
            if (subscriptionRepository.existsByStripeSubscriptionId(subscriptionId)) {
                log.debug("Lost a race to activate subscription {} twice; another attempt already won", subscriptionId);
                return;
            }
            log.warn("User {} already has a non-terminal subscription; refusing to activate a second one ({})",
                    userId, subscriptionId, e);
        }
    }

    @Override
    @Transactional
    public void updateSubscription(String gatewaySubscriptionId, SubscriptionStatus status, Instant periodStart,
                                   Instant periodEnd, Boolean cancelAtPeriodEnd, Long planId, Instant eventTime) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);

        if (isStale(subscription, eventTime)) {
            log.debug("Dropping an out-of-order update for subscription {}: event at {} is older than the last " +
                    "applied event at {}", gatewaySubscriptionId, eventTime, subscription.getLastEventAt());
            return;
        }

        boolean hasSubscriptionUpdated = false;

        if (status != null && status != subscription.getStatus()) {
            applyStatus(subscription, status);
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

        if (cancelAtPeriodEnd != null && !Objects.equals(cancelAtPeriodEnd, subscription.getCancelAtPeriodEnd())) {
            subscription.setCancelAtPeriodEnd(cancelAtPeriodEnd);
            hasSubscriptionUpdated = true;
        }

        if (planId != null && !planId.equals(subscription.getPlan().getId())) {
            Plan newPlan = getPlan(planId);
            subscription.setPlan(newPlan);
            hasSubscriptionUpdated = true;
        }

        if (hasSubscriptionUpdated || eventTime != null) {
            markSynced(subscription, eventTime);
            log.debug("Subscription has been updated: {}", gatewaySubscriptionId);
            subscriptionRepository.save(subscription);
        }
    }

    @Override
    public void cancelSubscription(String gatewaySubscriptionId, Instant eventTime) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);

        if (isStale(subscription, eventTime)) {
            log.debug("Dropping an out-of-order cancellation for subscription {}: event at {} is older than the " +
                    "last applied event at {}", gatewaySubscriptionId, eventTime, subscription.getLastEventAt());
            return;
        }

        applyStatus(subscription, SubscriptionStatus.CANCELED);
        markSynced(subscription, eventTime);
        subscriptionRepository.save(subscription);
    }

    @Override
    public void renewSubscriptionPeriod(String gatewaySubscriptionId, Instant periodStart, Instant periodEnd, Instant eventTime) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);

        if (isStale(subscription, eventTime)) {
            log.debug("Dropping an out-of-order renewal for subscription {}: event at {} is older than the last " +
                    "applied event at {}", gatewaySubscriptionId, eventTime, subscription.getLastEventAt());
            return;
        }

        Instant newStart = periodStart != null ? periodStart : subscription.getCurrentPeriodEnd();
        subscription.setCurrentPeriodStart(newStart);
        subscription.setCurrentPeriodEnd(periodEnd);

        if (subscription.getStatus() == SubscriptionStatus.PAST_DUE || subscription.getStatus() == SubscriptionStatus.INCOMPLETE
                || subscription.getStatus() == SubscriptionStatus.UNPAID) {
            applyStatus(subscription, SubscriptionStatus.ACTIVE);
        }

        markSynced(subscription, eventTime);
        subscriptionRepository.save(subscription);
    }

    @Override
    public void markSubscriptionPastDue(String gatewaySubscriptionId, Instant eventTime) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);

        if (subscription.getStatus() == SubscriptionStatus.PAST_DUE) {
            log.debug("Subscription is already past due, gatewaySubscriptionId: {}", gatewaySubscriptionId);
            return;
        }

        if (isStale(subscription, eventTime)) {
            log.debug("Dropping an out-of-order past-due mark for subscription {}: event at {} is older than the " +
                    "last applied event at {}", gatewaySubscriptionId, eventTime, subscription.getLastEventAt());
            return;
        }

        applyStatus(subscription, SubscriptionStatus.PAST_DUE);
        markSynced(subscription, eventTime);
        subscriptionRepository.save(subscription);
    }

    @Override
    public void markSyncPending(String gatewaySubscriptionId) {
        Subscription subscription = getSubscription(gatewaySubscriptionId);
        if (Boolean.TRUE.equals(subscription.getSyncPending())) {
            return;
        }
        subscription.setSyncPending(true);
        subscriptionRepository.save(subscription);
    }

    /** True when eventTime is present and strictly older than the last event this row already applied. */
    private boolean isStale(Subscription subscription, Instant eventTime) {
        return eventTime != null && subscription.getLastEventAt() != null
                && eventTime.isBefore(subscription.getLastEventAt());
    }

    /** A save that actually reads Stripe back (a webhook, or a live sync) proves the local mirror is current. */
    private void markSynced(Subscription subscription, Instant eventTime) {
        if (eventTime != null) {
            subscription.setLastEventAt(eventTime);
        }
        subscription.setSyncPending(false);
    }

    private void applyStatus(Subscription subscription, SubscriptionStatus status) {
        subscription.setStatus(status);
        if (status == SubscriptionStatus.PAST_DUE) {
            if (subscription.getPastDueSince() == null) {
                subscription.setPastDueSince(clock.instant());
            }
        } else {
            subscription.setPastDueSince(null);
        }
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
