package com.vibecraft.account.controller;

import com.vibecraft.account.dto.subscription.*;
import com.vibecraft.account.service.PaymentProcessor;
import com.vibecraft.account.service.PlanService;
import com.vibecraft.account.service.SubscriptionService;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Plans, subscriptions and Stripe billing.
 *
 * <p>Handles: the public plan catalogue, the caller's current subscription, starting a Stripe Checkout session,
 * opening the billing portal, changing plan in place (upgrade, downgrade, cancel to free or resume), confirming a
 * checkout the browser just returned from, and receiving Stripe's webhook.
 *
 * <p>The webhook is verified by Stripe's own signature rather than by a session or CSRF token - it is the one caller
 * that structurally cannot carry either. An event whose payload will not deserialize is acknowledged rather than
 * retried forever; a bad signature is rejected with a 400.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class BillingController {

    private final PlanService planService;
    private final SubscriptionService subscriptionService;
    private final PaymentProcessor paymentProcessor;

    @Value("${stripe.webhook.secret}")
    private String webhookSecret;

    @GetMapping("/api/plans")
    public ResponseEntity<List<PlanResponse>> getAllPlans() {
        return ResponseEntity.ok(planService.getAllActivePlans());
    }

    @GetMapping("/api/me/subscription")
    public ResponseEntity<SubscriptionResponse> getMySubscription() {
        return ResponseEntity.ok(subscriptionService.getCurrentSubscription());
    }

    @PostMapping("/api/payments/checkout")
    public ResponseEntity<CheckoutResponse> createCheckoutResponse(
            @RequestBody @Valid CheckoutRequest request
    ) {
        return ResponseEntity.ok(paymentProcessor.createCheckoutSessionUrl(request));
    }

    @PostMapping("/api/payments/portal")
    public ResponseEntity<PortalResponse> openCustomerPortal() {
        return ResponseEntity.ok(paymentProcessor.openCustomerPortal());
    }

    @PostMapping("/api/payments/change-plan")
    public ResponseEntity<SubscriptionResponse> changePlan(@RequestBody @Valid ChangePlanRequest request) {
        return ResponseEntity.ok(paymentProcessor.changePlan(request));
    }

    @PostMapping("/api/payments/confirm")
    public ResponseEntity<SubscriptionResponse> confirmCheckout(
            @RequestBody @Valid ConfirmCheckoutRequest request
    ) {
        return ResponseEntity.ok(paymentProcessor.confirmCheckoutSession(request));
    }

    @PostMapping("/webhooks/payment")
    public ResponseEntity<String> handlePaymentWebhooks(
            @RequestBody String payload,
            @RequestHeader("Stripe-Signature") String sigHeader
    ) {

        try {
            Event event = Webhook.constructEvent(payload, sigHeader, webhookSecret);

            EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
            StripeObject stripeObject = null;

            if (deserializer.getObject().isPresent()) {
                stripeObject = deserializer.getObject().get();
            } else {
                try {
                    stripeObject = deserializer.deserializeUnsafe();
                    if (stripeObject == null) {
                        log.warn("Failed to deserialize webhook object for event: {}", event.getType());
                        return ResponseEntity.ok().build();
                    }
                } catch (Exception e) {
                    log.error("Unsafe deserialization failed for event {}: {}", event.getType(), e.getMessage());
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Deserialization failed");
                }
            }

            Map<String, String> metadata = new HashMap<>();
            if (stripeObject instanceof Session session) {
                metadata = session.getMetadata();
            }

            Instant eventCreatedAt = event.getCreated() != null ? Instant.ofEpochSecond(event.getCreated()) : null;
            paymentProcessor.handleWebhookEvent(event.getType(), stripeObject, metadata, event.getId(), eventCreatedAt);
            return ResponseEntity.ok().build();

        } catch (SignatureVerificationException e) {
            log.warn("Rejected a webhook with an invalid Stripe signature: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Invalid signature");
        }
    }
}
