package com.singularity.account.controller;

import com.singularity.account.entity.Plan;
import com.singularity.account.entity.Subscription;
import com.singularity.account.entity.User;
import com.singularity.account.enums.SubscriptionStatus;
import com.singularity.account.mapper.PlanMapper;
import com.singularity.account.mapper.SubscriptionMapper;
import com.singularity.account.repository.CheckoutIntentRepository;
import com.singularity.account.repository.PlanRepository;
import com.singularity.account.repository.SubscriptionRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.repository.WebhookEventRepository;
import com.singularity.account.service.PlanService;
import com.singularity.account.service.impl.StripePaymentProcessor;
import com.singularity.account.service.impl.SubscriptionServiceImpl;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.security.AuthUtil;
import com.stripe.exception.ApiConnectionException;
import com.stripe.net.ApiResource;
import com.stripe.net.Webhook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Follows one subscription through its life as Stripe reports it, from signed webhook to stored state.
 *
 * <p>Handles: a paid checkout becoming an active subscription on the plan that was bought; the same delivery arriving
 * twice changing nothing; a delivery whose handling failed being applied when Stripe sends it again; a move to
 * another plan; an older event arriving late and being dropped; a failed payment keeping the plan through the grace
 * period and losing it after; a paid invoice restoring it; a cancellation ending it; and a body changed after it was
 * signed, or signed with another secret, being refused with nothing stored.
 *
 * <p>The controller, the payment processor and the subscription service are the real classes, joined as they are in
 * the running service, so each payload is verified by Stripe's own signature check, turned into Stripe's own objects
 * and applied by the real rules. Only the edges are stand-ins: the repositories keep their rows in memory, with the
 * webhook inbox following the same claim rule its SQL does, and the one Stripe call the handlers make - reading a
 * subscription back - answers with whatever the test last said Stripe holds. Nothing here reaches Stripe.
 *
 * <p>The clock is the test's own. A signature's timestamp has to be the real time, because Stripe's check compares it
 * to the system clock; an event's creation time is the test's, which is what the ordering rule reads.
 */
class BillingWebhookFlowTest {

    private static final String SECRET = "whsec_flow_test_secret";
    private static final Long USER_ID = 7L;
    private static final Long PRO = 2L;
    private static final Long BUSINESS = 3L;
    private static final String SUBSCRIPTION = "sub_flow_1";
    private static final Instant START = Instant.parse("2026-10-09T10:00:00Z");

    private final MovableClock clock = new MovableClock(START);
    private final User user = User.builder().id(USER_ID).username("person@example.com").build();
    private final Map<Long, Plan> plans = Map.of(
            PRO, Plan.builder().id(PRO).name("Pro").stripePriceId("price_pro").build(),
            BUSINESS, Plan.builder().id(BUSINESS).name("Business").stripePriceId("price_business").build());
    private final List<Subscription> subscriptions = new ArrayList<>();
    private final Map<String, String> inbox = new HashMap<>();

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PlanRepository planRepository = mock(PlanRepository.class);
    private final SubscriptionRepository subscriptionRepository = mock(SubscriptionRepository.class);
    private final WebhookEventRepository webhookEvents = mock(WebhookEventRepository.class);
    private final CheckoutIntentRepository intents = mock(CheckoutIntentRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);

    private final SubscriptionServiceImpl subscriptionService = new SubscriptionServiceImpl(subscriptionRepository,
            userRepository, planRepository, authUtil, mock(SubscriptionMapper.class), mock(PlanMapper.class), clock);
    private final StripePaymentProcessor processor = new StripePaymentProcessor(authUtil, planRepository,
            userRepository, intents, webhookEvents, subscriptionService, clock);
    private final BillingController controller = new BillingController(mock(PlanService.class), subscriptionService,
            processor);

    private String stripeHolds;
    private boolean stripeUnreachable;

    @BeforeEach
    void anAccountWithNoSubscription() {
        ReflectionTestUtils.setField(controller, "webhookSecret", SECRET);

        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(planRepository.findById(anyLong())).thenAnswer(call -> Optional.ofNullable(plans.get(call.<Long>getArgument(0))));
        when(planRepository.findByStripePriceId(anyString())).thenAnswer(call -> plans.values().stream()
                .filter(plan -> plan.getStripePriceId().equals(call.getArgument(0))).findFirst());

        when(subscriptionRepository.save(any(Subscription.class))).thenAnswer(call -> {
            Subscription row = call.getArgument(0);
            if (!subscriptions.contains(row)) {
                row.setId((long) subscriptions.size() + 1);
                subscriptions.add(row);
            }
            return row;
        });
        when(subscriptionRepository.existsByStripeSubscriptionId(anyString())).thenAnswer(call ->
                subscriptions.stream().anyMatch(row -> row.getStripeSubscriptionId().equals(call.getArgument(0))));
        when(subscriptionRepository.findByStripeSubscriptionId(anyString())).thenAnswer(call ->
                subscriptions.stream().filter(row -> row.getStripeSubscriptionId().equals(call.getArgument(0))).findFirst());
        when(subscriptionRepository.findByUserIdAndStatusIn(anyLong(), any())).thenAnswer(call -> {
            Set<SubscriptionStatus> wanted = call.getArgument(1);
            return subscriptions.stream().filter(row -> wanted.contains(row.getStatus())).findFirst();
        });

        when(webhookEvents.tryClaim(anyString(), anyString(), any())).thenAnswer(call -> {
            String id = call.getArgument(0);
            if ("PROCESSED".equals(inbox.get(id))) {
                return 0;
            }
            inbox.put(id, "RECEIVED");
            return 1;
        });
        doAnswer(call -> inbox.put(call.getArgument(0), "PROCESSED")).when(webhookEvents).markProcessed(anyString());
    }

    @Test
    void aPaidCheckoutBecomesAnActiveSubscriptionOnThePlanThatWasBought() {
        stripeHolds = stripeSubscription("active", "price_pro", false, 1_000, 2_000);

        ResponseEntity<String> answer = deliver(checkoutCompleted("evt_checkout", at(0)));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        Subscription row = onlySubscription();
        assertThat(row.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(row.getPlan().getName()).isEqualTo("Pro");
        assertThat(row.getCurrentPeriodStart()).isEqualTo(Instant.ofEpochSecond(1_000));
        assertThat(row.getCurrentPeriodEnd()).isEqualTo(Instant.ofEpochSecond(2_000));
        assertThat(user.getStripeCustomerId()).isEqualTo("cus_flow_1");
        assertThat(subscriptionService.getActivePlan(USER_ID).getName()).isEqualTo("Pro");
        assertThat(inbox).containsEntry("evt_checkout", "PROCESSED");
        verify(intents).deleteById(USER_ID);
    }

    @Test
    void theSameDeliveryArrivingTwiceChangesNothing() {
        stripeHolds = stripeSubscription("active", "price_pro", false, 1_000, 2_000);
        deliver(checkoutCompleted("evt_checkout", at(0)));
        clock.advance(Duration.ofMinutes(1));

        deliver(subscriptionEvent("evt_cancel", "customer.subscription.deleted", at(70), "canceled", "price_pro", false));
        assertThat(onlySubscription().getStatus()).isEqualTo(SubscriptionStatus.CANCELED);
        onlySubscription().setStatus(SubscriptionStatus.ACTIVE);

        ResponseEntity<String> again = deliver(
                subscriptionEvent("evt_cancel", "customer.subscription.deleted", at(70), "canceled", "price_pro", false));

        assertThat(again.getStatusCode().value()).isEqualTo(200);
        assertThat(onlySubscription().getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(subscriptions).hasSize(1);
    }

    @Test
    void aDeliveryWhoseHandlingFailedIsAppliedWhenStripeSendsItAgain() {
        subscribedToPro();
        deliver(invoiceEvent("evt_failed", "invoice.payment_failed", at(100)));
        assertThat(onlySubscription().getStatus()).isEqualTo(SubscriptionStatus.PAST_DUE);

        stripeUnreachable = true;
        String paid = invoiceEvent("evt_paid", "invoice.paid", at(200));
        assertThatThrownBy(() -> deliver(paid)).isInstanceOf(ExternalServiceException.class);
        assertThat(inbox).containsEntry("evt_paid", "RECEIVED");
        assertThat(onlySubscription().getStatus()).isEqualTo(SubscriptionStatus.PAST_DUE);

        stripeUnreachable = false;
        stripeHolds = stripeSubscription("active", "price_pro", false, 2_000, 3_000);
        deliver(paid);

        assertThat(onlySubscription().getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(onlySubscription().getCurrentPeriodEnd()).isEqualTo(Instant.ofEpochSecond(3_000));
        assertThat(inbox).containsEntry("evt_paid", "PROCESSED");
    }

    @Test
    void aMoveToAnotherPlanIsFollowed() {
        subscribedToPro();

        deliver(subscriptionEvent("evt_upgrade", "customer.subscription.updated", at(100), "active", "price_business", false));

        assertThat(subscriptionService.getActivePlan(USER_ID).getName()).isEqualTo("Business");
    }

    @Test
    void aCancellationAtThePeriodEndKeepsThePlanUntilStripeEndsIt() {
        subscribedToPro();

        deliver(subscriptionEvent("evt_scheduled", "customer.subscription.updated", at(100), "active", "price_pro", true));

        assertThat(onlySubscription().getCancelAtPeriodEnd()).isTrue();
        assertThat(subscriptionService.getActivePlan(USER_ID).getName()).isEqualTo("Pro");

        deliver(subscriptionEvent("evt_ended", "customer.subscription.deleted", at(200), "canceled", "price_pro", false));

        assertThat(onlySubscription().getStatus()).isEqualTo(SubscriptionStatus.CANCELED);
        assertThat(subscriptionService.getActiveSubscription(USER_ID)).isEmpty();
    }

    @Test
    void anOlderEventArrivingLateDoesNotUndoANewerOne() {
        subscribedToPro();
        deliver(subscriptionEvent("evt_newer", "customer.subscription.updated", at(300), "active", "price_business", false));

        ResponseEntity<String> late = deliver(
                subscriptionEvent("evt_older", "customer.subscription.updated", at(200), "active", "price_pro", false));

        assertThat(late.getStatusCode().value()).isEqualTo(200);
        assertThat(subscriptionService.getActivePlan(USER_ID).getName()).isEqualTo("Business");
        assertThat(inbox).containsEntry("evt_older", "PROCESSED");
    }

    @Test
    void aFailedPaymentKeepsThePlanThroughTheGracePeriodAndLosesItAfter() {
        subscribedToPro();

        deliver(invoiceEvent("evt_failed", "invoice.payment_failed", at(100)));

        assertThat(onlySubscription().getStatus()).isEqualTo(SubscriptionStatus.PAST_DUE);
        assertThat(subscriptionService.getActivePlan(USER_ID).getName()).isEqualTo("Pro");

        clock.advance(Duration.ofDays(6));
        assertThat(subscriptionService.getActiveSubscription(USER_ID)).isPresent();

        clock.advance(Duration.ofDays(2));
        assertThat(subscriptionService.getActiveSubscription(USER_ID)).isEmpty();
    }

    @Test
    void aPaidInvoiceAfterAFailedOneRestoresThePlan() {
        subscribedToPro();
        deliver(invoiceEvent("evt_failed", "invoice.payment_failed", at(100)));
        clock.advance(Duration.ofDays(8));
        assertThat(subscriptionService.getActiveSubscription(USER_ID)).isEmpty();

        stripeHolds = stripeSubscription("active", "price_pro", false, 5_000, 6_000);
        deliver(invoiceEvent("evt_paid", "invoice.paid", at(Duration.ofDays(8).toSeconds())));

        Subscription row = onlySubscription();
        assertThat(row.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
        assertThat(row.getPastDueSince()).isNull();
        assertThat(row.getCurrentPeriodStart()).isEqualTo(Instant.ofEpochSecond(5_000));
        assertThat(subscriptionService.getActivePlan(USER_ID).getName()).isEqualTo("Pro");
    }

    @Test
    void aBodyChangedAfterItWasSignedIsRefusedAndNothingIsStored() {
        String genuine = checkoutCompleted("evt_checkout", at(0));
        String header = sign(genuine, SECRET);
        String forged = genuine.replace("\"plan_id\": \"" + PRO + "\"", "\"plan_id\": \"" + BUSINESS + "\"");
        assertThat(forged).isNotEqualTo(genuine);

        ResponseEntity<String> answer = controller.handlePaymentWebhooks(forged, header);

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(subscriptions).isEmpty();
        assertThat(inbox).isEmpty();
    }

    @Test
    void aBodySignedWithAnotherSecretIsRefusedAndNothingIsStored() {
        String payload = checkoutCompleted("evt_checkout", at(0));

        ResponseEntity<String> answer = controller.handlePaymentWebhooks(payload, sign(payload, "whsec_someone_elses"));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(subscriptions).isEmpty();
        assertThat(inbox).isEmpty();
    }

    @Test
    void aCheckoutThatNamesNoAccountActivatesNothingAndIsNotRetried() {
        String payload = checkoutCompleted("evt_checkout", at(0)).replace("\"user_id\": \"" + USER_ID + "\"", "\"user_id\": \"\"");

        ResponseEntity<String> answer = deliver(payload);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(subscriptions).isEmpty();
        assertThat(inbox).containsEntry("evt_checkout", "PROCESSED");
    }

    private void subscribedToPro() {
        stripeHolds = stripeSubscription("active", "price_pro", false, 1_000, 2_000);
        deliver(checkoutCompleted("evt_checkout", at(0)));
        clock.advance(Duration.ofSeconds(30));
    }

    private Subscription onlySubscription() {
        assertThat(subscriptions).hasSize(1);
        return subscriptions.get(0);
    }

    private long at(long secondsAfterStart) {
        return START.getEpochSecond() + secondsAfterStart;
    }

    private ResponseEntity<String> deliver(String payload) {
        try (MockedStatic<com.stripe.model.Subscription> stripe = mockStatic(com.stripe.model.Subscription.class)) {
            stripe.when(() -> com.stripe.model.Subscription.retrieve(SUBSCRIPTION)).thenAnswer(call -> {
                if (stripeUnreachable) {
                    throw new ApiConnectionException("Stripe could not be reached");
                }
                return ApiResource.GSON.fromJson(stripeHolds, com.stripe.model.Subscription.class);
            });
            return controller.handlePaymentWebhooks(payload, sign(payload, SECRET));
        }
    }

    private static String sign(String payload, String secret) {
        try {
            long timestamp = Instant.now().getEpochSecond();
            return "t=" + timestamp + ",v1=" + Webhook.Util.computeHmacSha256(secret, timestamp + "." + payload);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String stripeSubscription(String status, String priceId, boolean cancelAtPeriodEnd,
                                             long periodStart, long periodEnd) {
        return """
                {
                  "id": "%s",
                  "object": "subscription",
                  "status": "%s",
                  "cancel_at_period_end": %s,
                  "items": {
                    "object": "list",
                    "data": [
                      {
                        "id": "si_flow_1",
                        "object": "subscription_item",
                        "current_period_start": %d,
                        "current_period_end": %d,
                        "price": { "id": "%s", "object": "price" }
                      }
                    ]
                  }
                }
                """.formatted(SUBSCRIPTION, status, cancelAtPeriodEnd, periodStart, periodEnd, priceId);
    }

    private static String event(String eventId, String type, long created, String object) {
        return """
                {
                  "id": "%s",
                  "object": "event",
                  "api_version": "%s",
                  "created": %d,
                  "type": "%s",
                  "data": { "object": %s }
                }
                """.formatted(eventId, com.stripe.Stripe.API_VERSION, created, type, object);
    }

    private static String checkoutCompleted(String eventId, long created) {
        return event(eventId, "checkout.session.completed", created, """
                {
                  "id": "cs_flow_1",
                  "object": "checkout.session",
                  "payment_status": "paid",
                  "status": "complete",
                  "subscription": "%s",
                  "customer": "cus_flow_1",
                  "metadata": { "user_id": "%d", "plan_id": "%d" }
                }
                """.formatted(SUBSCRIPTION, USER_ID, PRO));
    }

    private static String subscriptionEvent(String eventId, String type, long created, String status, String priceId,
                                            boolean cancelAtPeriodEnd) {
        return event(eventId, type, created, stripeSubscription(status, priceId, cancelAtPeriodEnd, 1_000, 2_000));
    }

    private static String invoiceEvent(String eventId, String type, long created) {
        return event(eventId, type, created, """
                {
                  "id": "in_flow_1",
                  "object": "invoice",
                  "parent": {
                    "type": "subscription_details",
                    "subscription_details": { "subscription": "%s" }
                  }
                }
                """.formatted(SUBSCRIPTION));
    }

    private static final class MovableClock extends Clock {

        private Instant now;

        private MovableClock(Instant start) {
            this.now = start;
        }

        void advance(Duration by) {
            now = now.plus(by);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }
    }
}
