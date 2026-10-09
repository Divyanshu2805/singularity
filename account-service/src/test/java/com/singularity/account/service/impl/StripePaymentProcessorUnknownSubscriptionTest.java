package com.singularity.account.service.impl;

import com.singularity.account.repository.CheckoutIntentRepository;
import com.singularity.account.repository.PlanRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.repository.WebhookEventRepository;
import com.singularity.account.service.SubscriptionService;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.security.AuthUtil;
import com.stripe.model.Subscription;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A webhook about a subscription this database has never heard of.
 *
 * <p>Handles: the event is acknowledged and marked processed instead of being thrown back at Stripe as a 404, which
 * Stripe would retry for days; and any other failure of a handler still propagates, so a real fault is still retried.
 */
class StripePaymentProcessorUnknownSubscriptionTest {

    private static final Instant CREATED = Instant.parse("2026-10-08T09:59:00Z");

    private final WebhookEventRepository webhookEvents = mock(WebhookEventRepository.class);
    private final SubscriptionService subscriptionService = mock(SubscriptionService.class);

    private final StripePaymentProcessor processor = new StripePaymentProcessor(mock(AuthUtil.class),
            mock(PlanRepository.class), mock(UserRepository.class), mock(CheckoutIntentRepository.class), webhookEvents,
            subscriptionService, Clock.fixed(Instant.parse("2026-10-08T10:00:00Z"), ZoneOffset.UTC));

    private final Subscription deleted = mock(Subscription.class);

    @BeforeEach
    void anEventNotSeenBefore() {
        when(webhookEvents.tryClaim(eq("evt_1"), any(), any())).thenReturn(1);
        when(deleted.getId()).thenReturn("sub_unknown");
    }

    @Test
    void anUnknownSubscriptionIsAcknowledgedAndTheEventMarkedProcessed() {
        doThrow(new ResourceNotFoundException("Subscription", "sub_unknown"))
                .when(subscriptionService).cancelSubscription(eq("sub_unknown"), any());

        assertThatCode(() -> processor.handleWebhookEvent(
                "customer.subscription.deleted", deleted, Map.of(), "evt_1", CREATED)).doesNotThrowAnyException();

        verify(webhookEvents).markProcessed("evt_1");
    }

    @Test
    void anyOtherFailureStillPropagatesSoStripeTriesAgain() {
        doThrow(new ExternalServiceException("database unavailable", null))
                .when(subscriptionService).cancelSubscription(eq("sub_unknown"), any());

        assertThatThrownBy(() -> processor.handleWebhookEvent(
                "customer.subscription.deleted", deleted, Map.of(), "evt_1", CREATED))
                .isInstanceOf(ExternalServiceException.class);

        verify(webhookEvents, never()).markProcessed(any());
    }
}
