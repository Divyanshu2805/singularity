package com.singularity.account.service.impl;

import com.singularity.account.dto.subscription.CheckoutRequest;
import com.singularity.account.dto.subscription.CheckoutResponse;
import com.singularity.account.entity.CheckoutIntent;
import com.singularity.account.entity.Plan;
import com.singularity.account.entity.User;
import com.singularity.account.repository.CheckoutIntentRepository;
import com.singularity.account.repository.PlanRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.repository.WebhookEventRepository;
import com.singularity.account.service.SubscriptionService;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.security.AuthUtil;
import com.stripe.exception.InvalidRequestException;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import com.stripe.param.checkout.SessionCreateParams;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Proves a checkout survives a stored Stripe customer that Stripe no longer has.
 *
 * <p>Handles: a user whose customer was deleted being checked out by email under a fresh idempotency key, with the
 * dead customer forgotten; any other refusal from Stripe still being a 503 with nothing forgotten; and a user with no
 * stored customer never being asked twice.
 *
 * <p>Seen in production on 2026-10-08: one account answered every checkout with "temporarily unavailable" while a
 * new account worked, because its customer had been deleted in the Stripe dashboard. Stripe's static calls are
 * replaced for the length of each test; nothing here reaches Stripe.
 */
class StripePaymentProcessorCheckoutTest {

    private static final Long USER_ID = 7L;
    private static final Long PLAN_ID = 2L;
    private static final String FIRST_KEY = "first-key";

    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final PlanRepository planRepository = mock(PlanRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final CheckoutIntentRepository intents = mock(CheckoutIntentRepository.class);
    private final SubscriptionService subscriptionService = mock(SubscriptionService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-08T10:00:00Z"), ZoneOffset.UTC);

    private final StripePaymentProcessor processor = new StripePaymentProcessor(authUtil, planRepository,
            userRepository, intents, mock(WebhookEventRepository.class), subscriptionService, clock);

    private User user;

    @BeforeEach
    void aUserAboutToCheckOut() {
        ReflectionTestUtils.setField(processor, "frontendUrl", "https://app.example");
        user = User.builder().id(USER_ID).username("person@example.com").build();
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(planRepository.findById(PLAN_ID))
                .thenReturn(Optional.of(Plan.builder().id(PLAN_ID).stripePriceId("price_pro").build()));
        when(subscriptionService.getActiveSubscription(USER_ID)).thenReturn(Optional.empty());
        when(intents.findById(USER_ID)).thenReturn(Optional.of(
                CheckoutIntent.builder().userId(USER_ID).planId(PLAN_ID).idempotencyKey(FIRST_KEY).build()));
    }

    private static InvalidRequestException refusal(String code, String param) {
        return new InvalidRequestException("refused", param, "req_1", code, 400, null);
    }

    private static Session openSession() {
        Session session = mock(Session.class);
        when(session.getId()).thenReturn("cs_test_1");
        when(session.getUrl()).thenReturn("https://checkout.stripe.test/cs_test_1");
        return session;
    }

    @Test
    void aCustomerStripeNoLongerHasIsForgottenAndTheCheckoutIsAskedForByEmail() {
        user.setStripeCustomerId("cus_deleted");
        try (MockedStatic<Session> stripe = mockStatic(Session.class)) {
            Session session = openSession();
            stripe.when(() -> Session.create(any(SessionCreateParams.class), any(RequestOptions.class)))
                    .thenThrow(refusal("resource_missing", "customer"))
                    .thenReturn(session);

            CheckoutResponse response = processor.createCheckoutSessionUrl(new CheckoutRequest(PLAN_ID));

            assertThat(response.checkoutUrl()).isEqualTo("https://checkout.stripe.test/cs_test_1");
            assertThat(user.getStripeCustomerId()).isNull();
            verify(userRepository).save(user);

            ArgumentCaptor<SessionCreateParams> params = ArgumentCaptor.forClass(SessionCreateParams.class);
            ArgumentCaptor<RequestOptions> options = ArgumentCaptor.forClass(RequestOptions.class);
            stripe.verify(() -> Session.create(params.capture(), options.capture()), times(2));
            List<SessionCreateParams> sent = params.getAllValues();
            assertThat(sent.get(0).getCustomer()).isEqualTo("cus_deleted");
            assertThat(sent.get(1).getCustomer()).isNull();
            assertThat(sent.get(1).getCustomerEmail()).isEqualTo("person@example.com");

            String firstKey = options.getAllValues().get(0).getIdempotencyKey();
            String secondKey = options.getAllValues().get(1).getIdempotencyKey();
            assertThat(firstKey).isEqualTo(FIRST_KEY);
            assertThat(secondKey).isNotEqualTo(FIRST_KEY);
            verify(intents).replaceKey(USER_ID, FIRST_KEY, secondKey);
            verify(intents).recordSession(USER_ID, secondKey, "cs_test_1");
        }
    }

    @Test
    void anyOtherRefusalIsStillUnavailableAndForgetsNothing() {
        user.setStripeCustomerId("cus_live");
        try (MockedStatic<Session> stripe = mockStatic(Session.class)) {
            stripe.when(() -> Session.create(any(SessionCreateParams.class), any(RequestOptions.class)))
                    .thenThrow(refusal("resource_missing", "line_items[0][price]"));

            assertThatThrownBy(() -> processor.createCheckoutSessionUrl(new CheckoutRequest(PLAN_ID)))
                    .isInstanceOf(ExternalServiceException.class);

            assertThat(user.getStripeCustomerId()).isEqualTo("cus_live");
            verify(userRepository, never()).save(any());
            verify(intents, never()).replaceKey(any(), anyString(), anyString());
            stripe.verify(() -> Session.create(any(SessionCreateParams.class), any(RequestOptions.class)));
        }
    }

    @Test
    void aUserWithNoStoredCustomerIsAskedForOnce() {
        try (MockedStatic<Session> stripe = mockStatic(Session.class)) {
            stripe.when(() -> Session.create(any(SessionCreateParams.class), any(RequestOptions.class)))
                    .thenThrow(refusal("resource_missing", "customer"));

            assertThatThrownBy(() -> processor.createCheckoutSessionUrl(new CheckoutRequest(PLAN_ID)))
                    .isInstanceOf(ExternalServiceException.class);

            verify(intents, never()).replaceKey(eq(USER_ID), anyString(), anyString());
            stripe.verify(() -> Session.create(any(SessionCreateParams.class), any(RequestOptions.class)));
        }
    }
}
