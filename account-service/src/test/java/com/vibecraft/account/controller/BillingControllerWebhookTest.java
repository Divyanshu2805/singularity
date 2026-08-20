package com.vibecraft.account.controller;

import com.stripe.model.Invoice;
import com.stripe.model.StripeObject;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.vibecraft.account.service.PaymentProcessor;
import com.vibecraft.account.service.PlanService;
import com.vibecraft.account.service.SubscriptionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.http.ResponseEntity;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isA;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Covers CODE_REVIEW.md API-QA-12's contract for /webhooks/payment: a bad or stale signature is rejected before
 * PaymentProcessor ever sees the event, an unsupported event type is still acknowledged (not retried forever), and
 * a valid one carries Stripe's own event id/created timestamp and (for checkout.session.completed) its metadata
 * through untouched - the fields StripePaymentProcessor's idempotency and out-of-order guards (BILL-01/03) depend on.
 *
 * <p>Signatures are generated with Stripe's own {@code Webhook.Util.computeHmacSha256}, the exact scheme
 * {@code Webhook.constructEvent} verifies, so "bad signature" here means a real HMAC mismatch, not a malformed
 * header shape.
 */
class BillingControllerWebhookTest {

    private static final String SECRET = "whsec_test_secret";

    private final PlanService planService = mock(PlanService.class);
    private final SubscriptionService subscriptionService = mock(SubscriptionService.class);
    private final PaymentProcessor paymentProcessor = mock(PaymentProcessor.class);
    private final BillingController controller = new BillingController(planService, subscriptionService, paymentProcessor);

    @BeforeEach
    void injectWebhookSecret() throws Exception {
        Field field = BillingController.class.getDeclaredField("webhookSecret");
        field.setAccessible(true);
        field.set(controller, SECRET);
    }

    @Test
    void aBadSignatureIsRejectedAndNeverReachesTheProcessor() {
        String payload = subscriptionEvent("evt_bad_sig", "customer.subscription.deleted", "sub_1");

        ResponseEntity<String> response = controller.handlePaymentWebhooks(payload, "t=" + now() + ",v1=0000deadbeef0000");

        assertEquals(400, response.getStatusCode().value());
        verifyNoInteractions(paymentProcessor);
    }

    @Test
    void aStaleTimestampIsRejectedAndNeverReachesTheProcessor() {
        long staleTimestamp = now() - 600; // Webhook.constructEvent's default tolerance is 300s
        String payload = subscriptionEvent("evt_stale", "customer.subscription.deleted", "sub_1");

        ResponseEntity<String> response = controller.handlePaymentWebhooks(payload, sign(payload, staleTimestamp));

        assertEquals(400, response.getStatusCode().value());
        verifyNoInteractions(paymentProcessor);
    }

    @Test
    void anUnsupportedEventTypeIsStillAcknowledgedSoStripeStopsRetryingIt() {
        String payload = subscriptionEvent("evt_unsupported", "customer.subscription.trial_will_end", "sub_1");

        ResponseEntity<String> response = controller.handlePaymentWebhooks(payload, sign(payload, now()));

        assertEquals(200, response.getStatusCode().value());
        verify(paymentProcessor).handleWebhookEvent(
                eq("customer.subscription.trial_will_end"), any(StripeObject.class), anyMap(), eq("evt_unsupported"), any(Instant.class));
    }

    @Test
    void aSubscriptionDeletedEventCarriesItsOwnIdAndCreatedTimeToTheProcessor() {
        String payload = subscriptionEvent("evt_sub_deleted", "customer.subscription.deleted", "sub_42");

        ResponseEntity<String> response = controller.handlePaymentWebhooks(payload, sign(payload, now()));

        assertEquals(200, response.getStatusCode().value());
        verify(paymentProcessor).handleWebhookEvent(
                eq("customer.subscription.deleted"), isA(Subscription.class), anyMap(), eq("evt_sub_deleted"), any(Instant.class));
    }

    @Test
    void anInvoicePaidEventDeserializesIntoAnInvoice() {
        String payload = invoiceEvent("evt_invoice_paid", "invoice.paid", "sub_42");

        ResponseEntity<String> response = controller.handlePaymentWebhooks(payload, sign(payload, now()));

        assertEquals(200, response.getStatusCode().value());
        verify(paymentProcessor).handleWebhookEvent(
                eq("invoice.paid"), isA(Invoice.class), anyMap(), eq("evt_invoice_paid"), any(Instant.class));
    }

    @Test
    void aCheckoutSessionCompletedEventCarriesItsMetadataToTheProcessor() {
        String payload = checkoutSessionEvent("evt_checkout", "42", "3");

        ResponseEntity<String> response = controller.handlePaymentWebhooks(payload, sign(payload, now()));

        assertEquals(200, response.getStatusCode().value());
        verify(paymentProcessor).handleWebhookEvent(
                eq("checkout.session.completed"), isA(Session.class),
                eq(Map.of("user_id", "42", "plan_id", "3")), eq("evt_checkout"), any(Instant.class));
    }

    @Test
    void handlerExceptionsPropagateRatherThanBeingSwallowedAs200() {
        String payload = subscriptionEvent("evt_throws", "customer.subscription.deleted", "sub_1");
        doThrow(new RuntimeException("downstream failure"))
                .when(paymentProcessor).handleWebhookEvent(anyString(), any(), anyMap(), anyString(), any());

        Executable call = () -> controller.handlePaymentWebhooks(payload, sign(payload, now()));

        assertThrows(RuntimeException.class, call);
    }

    private long now() {
        return Instant.now().getEpochSecond();
    }

    private String sign(String payload, long timestamp) {
        try {
            String signedPayload = timestamp + "." + payload;
            String signature = Webhook.Util.computeHmacSha256(SECRET, signedPayload);
            return "t=" + timestamp + ",v1=" + signature;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String subscriptionEvent(String eventId, String type, String subscriptionId) {
        return """
                {
                  "id": "%s",
                  "object": "event",
                  "api_version": "2020-08-27",
                  "created": %d,
                  "type": "%s",
                  "data": {
                    "object": {
                      "id": "%s",
                      "object": "subscription",
                      "status": "canceled",
                      "cancel_at_period_end": false,
                      "items": { "object": "list", "data": [] }
                    }
                  }
                }
                """.formatted(eventId, now(), type, subscriptionId);
    }

    private String invoiceEvent(String eventId, String type, String subscriptionId) {
        return """
                {
                  "id": "%s",
                  "object": "event",
                  "api_version": "2020-08-27",
                  "created": %d,
                  "type": "%s",
                  "data": {
                    "object": {
                      "id": "in_test",
                      "object": "invoice",
                      "parent": {
                        "type": "subscription_details",
                        "subscription_details": { "subscription": "%s" }
                      }
                    }
                  }
                }
                """.formatted(eventId, now(), type, subscriptionId);
    }

    private String checkoutSessionEvent(String eventId, String userId, String planId) {
        return """
                {
                  "id": "%s",
                  "object": "event",
                  "api_version": "2020-08-27",
                  "created": %d,
                  "type": "checkout.session.completed",
                  "data": {
                    "object": {
                      "id": "cs_test",
                      "object": "checkout.session",
                      "payment_status": "paid",
                      "status": "complete",
                      "subscription": "sub_from_checkout",
                      "customer": "cus_test",
                      "metadata": { "user_id": "%s", "plan_id": "%s" }
                    }
                  }
                }
                """.formatted(eventId, now(), userId, planId);
    }
}
