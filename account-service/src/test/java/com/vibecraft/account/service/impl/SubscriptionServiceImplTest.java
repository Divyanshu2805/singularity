package com.vibecraft.account.service.impl;

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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers BILL-02 (idempotent activation under a constraint violation), BILL-03 (an out-of-order webhook is
 * dropped), and BILL-05 (PAST_DUE only entitles within its grace window).
 */
class SubscriptionServiceImplTest {

    private static final Instant NOW = Instant.parse("2026-09-20T10:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);
    private static final Long USER_ID = 1L;
    private static final String STRIPE_SUBSCRIPTION_ID = "sub_123";

    private final SubscriptionRepository subscriptionRepository = mock(SubscriptionRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final PlanRepository planRepository = mock(PlanRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final SubscriptionMapper subscriptionMapper = mock(SubscriptionMapper.class);
    private final PlanMapper planMapper = mock(PlanMapper.class);

    private final SubscriptionServiceImpl service = new SubscriptionServiceImpl(
            subscriptionRepository, userRepository, planRepository, authUtil, subscriptionMapper, planMapper, CLOCK);

    private Plan plan(Long id) {
        return Plan.builder().id(id).name("Pro").build();
    }

    private Subscription subscriptionWithStatus(SubscriptionStatus status) {
        return Subscription.builder()
                .id(1L)
                .user(User.builder().id(USER_ID).build())
                .plan(plan(2L))
                .status(status)
                .stripeSubscriptionId(STRIPE_SUBSCRIPTION_ID)
                .build();
    }

    @Test
    @DisplayName("BILL-05: PAST_DUE still entitles within the grace window")
    void pastDueEntitledWithinGracePeriod() {
        Subscription subscription = subscriptionWithStatus(SubscriptionStatus.PAST_DUE);
        subscription.setPastDueSince(NOW.minus(Duration.ofDays(3)));

        when(subscriptionRepository.findByUserIdAndStatusIn(eq(USER_ID), anySet()))
                .thenReturn(Optional.of(subscription));

        Optional<Subscription> result = service.getActiveSubscription(USER_ID);

        assertTrue(result.isPresent());
    }

    @Test
    @DisplayName("BILL-05: PAST_DUE stops entitling once the grace window has elapsed")
    void pastDueNotEntitledAfterGracePeriod() {
        Subscription subscription = subscriptionWithStatus(SubscriptionStatus.PAST_DUE);
        subscription.setPastDueSince(NOW.minus(Duration.ofDays(30)));

        when(subscriptionRepository.findByUserIdAndStatusIn(eq(USER_ID), anySet()))
                .thenReturn(Optional.of(subscription));

        Optional<Subscription> result = service.getActiveSubscription(USER_ID);

        assertTrue(result.isEmpty());
    }

    @Test
    @DisplayName("BILL-03: a delayed webhook older than the last applied event is dropped")
    void outOfOrderUpdateIsDropped() {
        Subscription subscription = subscriptionWithStatus(SubscriptionStatus.ACTIVE);
        subscription.setLastEventAt(NOW);

        when(subscriptionRepository.findByStripeSubscriptionId(STRIPE_SUBSCRIPTION_ID))
                .thenReturn(Optional.of(subscription));

        service.updateSubscription(STRIPE_SUBSCRIPTION_ID, SubscriptionStatus.PAST_DUE, null, null, null, null,
                NOW.minus(Duration.ofMinutes(5)));

        assertEquals(SubscriptionStatus.ACTIVE, subscription.getStatus());
        verify(subscriptionRepository, never()).save(any());
    }

    @Test
    @DisplayName("BILL-03: a newer webhook is applied and becomes the new last-applied event")
    void newerUpdateIsApplied() {
        Subscription subscription = subscriptionWithStatus(SubscriptionStatus.ACTIVE);
        subscription.setLastEventAt(NOW.minus(Duration.ofMinutes(5)));

        when(subscriptionRepository.findByStripeSubscriptionId(STRIPE_SUBSCRIPTION_ID))
                .thenReturn(Optional.of(subscription));

        service.updateSubscription(STRIPE_SUBSCRIPTION_ID, SubscriptionStatus.PAST_DUE, null, null, null, null, NOW);

        assertEquals(SubscriptionStatus.PAST_DUE, subscription.getStatus());
        assertEquals(NOW, subscription.getLastEventAt());
        verify(subscriptionRepository, times(1)).save(subscription);
    }

    @Test
    @DisplayName("BILL-02: a duplicate Stripe subscription id is treated as an idempotent no-op, not an error")
    void activateSubscriptionIdempotentOnDuplicateStripeId() {
        Plan plan = plan(2L);
        when(subscriptionRepository.existsByStripeSubscriptionId(STRIPE_SUBSCRIPTION_ID))
                .thenReturn(false)
                .thenReturn(true);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(User.builder().id(USER_ID).build()));
        when(planRepository.findById(2L)).thenReturn(Optional.of(plan));
        when(subscriptionRepository.save(any())).thenThrow(new DataIntegrityViolationException("duplicate key"));

        service.activateSubscription(USER_ID, 2L, STRIPE_SUBSCRIPTION_ID, "cus_123", NOW);

        verify(subscriptionRepository, times(2)).existsByStripeSubscriptionId(STRIPE_SUBSCRIPTION_ID);
    }

    @Test
    @DisplayName("BILL-04: markSyncPending flags the row without touching anything else")
    void markSyncPendingSetsFlag() {
        Subscription subscription = subscriptionWithStatus(SubscriptionStatus.ACTIVE);
        subscription.setSyncPending(false);

        when(subscriptionRepository.findByStripeSubscriptionId(STRIPE_SUBSCRIPTION_ID))
                .thenReturn(Optional.of(subscription));

        service.markSyncPending(STRIPE_SUBSCRIPTION_ID);

        assertTrue(subscription.getSyncPending());
        verify(subscriptionRepository).save(subscription);
    }
}
