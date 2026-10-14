package com.singularity.account.service.impl;

import com.singularity.account.repository.CheckoutIntentRepository;
import com.singularity.account.repository.PlanRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.repository.WebhookEventRepository;
import com.singularity.account.service.SubscriptionService;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.security.AuthUtil;
import com.stripe.exception.ApiConnectionException;
import com.stripe.exception.InvalidRequestException;
import com.stripe.model.Subscription;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Ending a subscription at once when its account is deleted: Stripe is told to cancel it now, a subscription Stripe
 * no longer has counts as ended, a subscription already cancelled there is not cancelled twice, and Stripe being
 * unreachable stops the deletion with the subscription still recorded as it was.
 */
class StripePaymentProcessorCancelImmediatelyTest {

    private static final Instant NOW = Instant.parse("2026-10-14T10:00:00Z");
    private static final long USER_ID = 7L;

    private final SubscriptionService subscriptionService = mock(SubscriptionService.class);

    private final StripePaymentProcessor processor = new StripePaymentProcessor(mock(AuthUtil.class),
            mock(PlanRepository.class), mock(UserRepository.class), mock(CheckoutIntentRepository.class),
            mock(WebhookEventRepository.class), subscriptionService, Clock.fixed(NOW, ZoneOffset.UTC));

    private void subscribed() {
        com.singularity.account.entity.Subscription current = com.singularity.account.entity.Subscription.builder()
                .stripeSubscriptionId("sub_1").build();
        when(subscriptionService.getActiveSubscription(USER_ID)).thenReturn(Optional.of(current));
    }

    @Test
    void aFreeAccountHasNothingToCancel() {
        when(subscriptionService.getActiveSubscription(USER_ID)).thenReturn(Optional.empty());

        try (MockedStatic<Subscription> stripe = mockStatic(Subscription.class)) {
            processor.cancelImmediately(USER_ID);
            stripe.verifyNoInteractions();
        }
        verify(subscriptionService, never()).cancelSubscription(anyString(), any());
    }

    @Test
    void cancelsAtStripeNowAndRecordsIt() throws Exception {
        subscribed();
        Subscription live = mock(Subscription.class);
        when(live.getStatus()).thenReturn("active");

        try (MockedStatic<Subscription> stripe = mockStatic(Subscription.class)) {
            stripe.when(() -> Subscription.retrieve("sub_1")).thenReturn(live);
            processor.cancelImmediately(USER_ID);
        }

        verify(live).cancel();
        verify(subscriptionService).cancelSubscription("sub_1", NOW);
    }

    @Test
    void aSubscriptionAlreadyCancelledAtStripeIsOnlyRecorded() throws Exception {
        subscribed();
        Subscription ended = mock(Subscription.class);
        when(ended.getStatus()).thenReturn("canceled");

        try (MockedStatic<Subscription> stripe = mockStatic(Subscription.class)) {
            stripe.when(() -> Subscription.retrieve("sub_1")).thenReturn(ended);
            processor.cancelImmediately(USER_ID);
        }

        verify(ended, never()).cancel();
        verify(subscriptionService).cancelSubscription("sub_1", NOW);
    }

    @Test
    void aSubscriptionStripeNoLongerHasCountsAsEnded() {
        subscribed();

        try (MockedStatic<Subscription> stripe = mockStatic(Subscription.class)) {
            stripe.when(() -> Subscription.retrieve("sub_1"))
                    .thenThrow(new InvalidRequestException("No such subscription", "id", "req_1", "resource_missing", 404, null));
            processor.cancelImmediately(USER_ID);
        }

        verify(subscriptionService).cancelSubscription("sub_1", NOW);
    }

    @Test
    void stripeUnreachableStopsTheDeletion() {
        subscribed();

        try (MockedStatic<Subscription> stripe = mockStatic(Subscription.class)) {
            stripe.when(() -> Subscription.retrieve("sub_1")).thenThrow(new ApiConnectionException("down"));
            assertThatThrownBy(() -> processor.cancelImmediately(USER_ID)).isInstanceOf(ExternalServiceException.class);
        }

        verify(subscriptionService, never()).cancelSubscription(anyString(), any());
    }
}
