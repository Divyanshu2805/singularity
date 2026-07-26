package com.vibecraft.account.service.impl;

import com.vibecraft.account.dto.subscription.ChangePlanRequest;
import com.vibecraft.account.dto.subscription.CheckoutRequest;
import com.vibecraft.account.dto.subscription.CheckoutResponse;
import com.vibecraft.account.dto.subscription.ConfirmCheckoutRequest;
import com.vibecraft.account.dto.subscription.PortalResponse;
import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.vibecraft.account.entity.Plan;
import com.vibecraft.account.entity.User;
import com.vibecraft.account.enums.SubscriptionStatus;
import com.vibecraft.account.repository.PlanRepository;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.account.service.PaymentProcessor;
import com.vibecraft.account.service.SubscriptionService;
import com.vibecraft.common.error.BadRequestException;
import com.vibecraft.common.error.ExternalServiceException;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.stripe.exception.CardException;
import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.stripe.model.Invoice;
import com.stripe.model.Price;
import com.stripe.model.StripeObject;
import com.stripe.model.Subscription;
import com.stripe.model.SubscriptionItem;
import com.stripe.model.checkout.Session;
import com.stripe.param.SubscriptionUpdateParams;
import com.stripe.param.checkout.SessionCreateParams;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

/**
 * The Stripe implementation of everything this platform does with payments.
 *
 * <p>Handles: creating a checkout session for a user with no subscription, opening the billing portal, changing plan
 * in place (upgrade with an immediate prorated invoice, downgrade with ordinary prorations, cancel to free, or resume
 * a cancellation), confirming a checkout the browser returned with, and consuming the five webhook events that matter
 * - checkout completed, subscription updated and deleted, invoice paid and invoice payment failed.
 *
 * <p>Confirming a checkout re-fetches the session from Stripe and checks both that it was paid and that its user_id
 * metadata is the caller's, so a session id alone proves nothing. A declined card on an upgrade is reported as a 400
 * saying the plan has not changed, rather than as a failure of unknown effect. Stripe being unreachable is an
 * ExternalServiceException, which becomes a 503 tagged as an upstream failure - not a bare runtime exception, which
 * would surface as a generic 500.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class StripePaymentProcessor implements PaymentProcessor {

    AuthUtil authUtil;
    PlanRepository planRepository;
    UserRepository userRepository;
    SubscriptionService subscriptionService;

    @NonFinal
    @Value("${client.url}")
    private String frontendUrl;

    @Override
    public CheckoutResponse createCheckoutSessionUrl(CheckoutRequest request) {
        Plan plan = planRepository.findById(request.planId()).orElseThrow(() ->
                new ResourceNotFoundException("Plan", request.planId().toString()));

        Long userId = authUtil.getCurrentUserId();
        User user = userRepository.findById(userId).orElseThrow(() ->
                new ResourceNotFoundException("user", userId.toString()));

        if (subscriptionService.getActiveSubscription(userId).isPresent()) {
            throw new BadRequestException("You already have a subscription - change your plan instead of checking out again.");
        }
        if (plan.getStripePriceId() == null || plan.getStripePriceId().isBlank()) {
            throw new BadRequestException("The free plan doesn't need a checkout.");
        }

        var params = SessionCreateParams.builder()
                .addLineItem(
                        SessionCreateParams.LineItem.builder().setPrice(plan.getStripePriceId()).setQuantity(1L).build())
                .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
                .setSubscriptionData(
                        new SessionCreateParams.SubscriptionData.Builder()
                                .setBillingMode(SessionCreateParams.SubscriptionData.BillingMode.builder()
                                        .setType(SessionCreateParams.SubscriptionData.BillingMode.Type.FLEXIBLE)
                                        .build())
                                .build()
                )
                .setSuccessUrl(frontendUrl + "/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}")
                .setCancelUrl(frontendUrl + "/pricing?checkout=cancelled")
                .putMetadata("user_id", userId.toString())
                .putMetadata("plan_id", plan.getId().toString());

        try {
            String stripeCustomerId = user.getStripeCustomerId();
            if (stripeCustomerId == null || stripeCustomerId.isEmpty()) {
                params.setCustomerEmail(user.getUsername());
            } else {
                params.setCustomer(stripeCustomerId);
            }
            Session session = Session.create(params.build());
            return new CheckoutResponse(session.getUrl());
        } catch (StripeException e) {
            throw new ExternalServiceException("Stripe rejected the checkout session for user " + userId, e);
        }
    }

    @Override
    public PortalResponse openCustomerPortal() {
        Long userId = authUtil.getCurrentUserId();
        User user = getUser(userId);
        String stripeCustomerId = user.getStripeCustomerId();

        if (stripeCustomerId == null || stripeCustomerId.isEmpty()) {
            throw new BadRequestException("You don't have a billing account yet - subscribe to a plan first.");
        }

        try {
            var portalSession = com.stripe.model.billingportal.Session.create(
                    com.stripe.param.billingportal.SessionCreateParams.builder()
                            .setCustomer(stripeCustomerId)
                            .setReturnUrl(frontendUrl + "/settings/billing")
                            .build()
            );

            return new PortalResponse(portalSession.getUrl());
        } catch (StripeException e) {
            throw new ExternalServiceException("Stripe rejected the billing-portal session for user " + userId, e);
        }
    }

    @Override
    public SubscriptionResponse changePlan(ChangePlanRequest request) {
        Long userId = authUtil.getCurrentUserId();
        Plan target = planRepository.findById(request.planId()).orElseThrow(() ->
                new ResourceNotFoundException("Plan", request.planId().toString()));

        com.vibecraft.account.entity.Subscription current = subscriptionService.getActiveSubscription(userId)
                .orElseThrow(() -> new BadRequestException("You don't have a subscription to change - choose a plan to subscribe."));
        String subscriptionId = current.getStripeSubscriptionId();
        boolean targetIsFree = target.getStripePriceId() == null || target.getStripePriceId().isBlank();
        boolean samePlan = target.getId().equals(current.getPlan().getId());
        boolean cancelling = Boolean.TRUE.equals(current.getCancelAtPeriodEnd());

        if (samePlan && !cancelling) {
            throw new BadRequestException("You're already on the " + target.getName() + " plan.");
        }

        try {
            Subscription stripeSubscription = Subscription.retrieve(subscriptionId);

            if (targetIsFree) {
                if (!cancelling) {
                    stripeSubscription.update(SubscriptionUpdateParams.builder().setCancelAtPeriodEnd(true).build());
                    log.info("User {} scheduled subscription {} to cancel at period end", userId, subscriptionId);
                }
            } else if (samePlan) {
                stripeSubscription.update(SubscriptionUpdateParams.builder().setCancelAtPeriodEnd(false).build());
                log.info("User {} resumed subscription {}", userId, subscriptionId);
            } else {
                switchPrice(stripeSubscription, current.getPlan(), target, cancelling);
                log.info("User {} switched subscription {} from {} to {}", userId, subscriptionId,
                        current.getPlan().getName(), target.getName());
            }
        } catch (CardException e) {
            log.warn("Plan change for user {} declined: {}", userId, e.getMessage());
            throw new BadRequestException("Your card was declined, so your plan hasn't changed. Update your card in Manage billing and try again.");
        } catch (StripeException e) {
            log.error("Couldn't change plan for user {} on subscription {}", userId, subscriptionId, e);
            throw new BadRequestException("Couldn't change your plan right now. Please try again.");
        }

        syncFromStripe(subscriptionId);
        return subscriptionService.getCurrentSubscription();
    }

    private void switchPrice(Subscription stripeSubscription, Plan from, Plan to, boolean cancelling) throws StripeException {
        String itemId = stripeSubscription.getItems().getData().get(0).getId();
        boolean upgrade = amount(to) > amount(from);

        if (cancelling) {
            stripeSubscription = stripeSubscription.update(
                    SubscriptionUpdateParams.builder().setCancelAtPeriodEnd(false).build());
        }

        SubscriptionUpdateParams.Builder params = SubscriptionUpdateParams.builder()
                .addItem(SubscriptionUpdateParams.Item.builder().setId(itemId).setPrice(to.getStripePriceId()).build());

        if (upgrade) {
            params.setProrationBehavior(SubscriptionUpdateParams.ProrationBehavior.ALWAYS_INVOICE)
                    .setPaymentBehavior(SubscriptionUpdateParams.PaymentBehavior.ERROR_IF_INCOMPLETE);
        } else {
            params.setProrationBehavior(SubscriptionUpdateParams.ProrationBehavior.CREATE_PRORATIONS);
        }
        stripeSubscription.update(params.build());
    }

    private int amount(Plan plan) {
        return plan.getPriceAmountMinor() == null ? 0 : plan.getPriceAmountMinor();
    }

    @Override
    public void handleWebhookEvent(String type, StripeObject stripeObject, Map<String, String> metadata) {
        log.info("Handling stripe event: {}", type);

        switch (type) {
            case "checkout.session.completed" -> handleCheckoutSessionCompleted((Session) stripeObject, metadata);
            case "customer.subscription.updated" -> handleCustomerSubscriptionUpdated((Subscription) stripeObject);
            case "customer.subscription.deleted" -> handleCustomerSubscriptionDeleted((Subscription) stripeObject);
            case "invoice.paid" -> handleInvoicePaid((Invoice) stripeObject);
            case "invoice.payment_failed" -> handleInvoicePaymentFailed((Invoice) stripeObject);
            default -> log.debug("Ignoring the event: {}", type);
        }
    }

    private void handleCheckoutSessionCompleted(Session session, Map<String, String> metadata) {
        if (session == null) {
            log.error("session object was null");
            return;
        }
        activateFromSession(session, metadata);
    }

    private Long activateFromSession(Session session, Map<String, String> metadata) {
        Long userId = parseMetadataId(metadata, "user_id");
        Long planId = parseMetadataId(metadata, "plan_id");
        String subscriptionId = session.getSubscription();

        if (userId == null || planId == null || subscriptionId == null) {
            log.error("Checkout session {} is missing user_id/plan_id/subscription - nothing to activate",
                    session.getId());
            return null;
        }

        User user = getUser(userId);
        if (user.getStripeCustomerId() == null) {
            user.setStripeCustomerId(session.getCustomer());
            userRepository.save(user);
        }

        subscriptionService.activateSubscription(userId, planId, subscriptionId, session.getCustomer());
        syncFromStripe(subscriptionId);
        return userId;
    }

    private void syncFromStripe(String subscriptionId) {
        try {
            Subscription subscription = Subscription.retrieve(subscriptionId);
            SubscriptionStatus status = mapStripeStatusToEnum(subscription.getStatus());
            SubscriptionItem item = subscription.getItems().getData().get(0);

            subscriptionService.updateSubscription(
                    subscriptionId,
                    status,
                    toInstant(item.getCurrentPeriodStart()),
                    toInstant(item.getCurrentPeriodEnd()),
                    subscription.getCancelAtPeriodEnd(),
                    resolvePlanId(item.getPrice()));
        } catch (StripeException e) {
            log.warn("Couldn't read subscription {} back from Stripe", subscriptionId, e);
        }
    }

    private Long parseMetadataId(Map<String, String> metadata, String key) {
        String raw = metadata == null ? null : metadata.get(key);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(raw.strip());
        } catch (NumberFormatException e) {
            log.error("Checkout metadata '{}' was not a number: {}", key, raw);
            return null;
        }
    }

    @Override
    public SubscriptionResponse confirmCheckoutSession(ConfirmCheckoutRequest request) {
        Long callerId = authUtil.getCurrentUserId();

        Session session;
        try {
            session = Session.retrieve(request.sessionId().strip());
        } catch (StripeException e) {
            log.warn("Couldn't retrieve checkout session {}", request.sessionId(), e);
            throw new BadRequestException("That checkout session couldn't be found.");
        }

        if (!"paid".equals(session.getPaymentStatus()) && !"complete".equals(session.getStatus())) {
            throw new BadRequestException("That checkout hasn't completed yet.");
        }

        Long sessionUserId = parseMetadataId(session.getMetadata(), "user_id");
        if (!callerId.equals(sessionUserId)) {
            log.warn("User {} tried to confirm checkout session {} belonging to user {}",
                    callerId, session.getId(), sessionUserId);
            throw new BadRequestException("That checkout session doesn't belong to this account.");
        }

        activateFromSession(session, session.getMetadata());
        return subscriptionService.getCurrentSubscription();
    }

    private void handleCustomerSubscriptionUpdated(Subscription subscription) {
        if (subscription == null) {
            log.error("subscription object was null inside handleCustomerSubscriptionUpdated");
            return;
        }

        SubscriptionStatus status = mapStripeStatusToEnum(subscription.getStatus());
        if (status == null) {
            log.warn("Unknown status '{}' for subscription {}", subscription.getStatus(), subscription.getId());
            return;
        }

        SubscriptionItem item = subscription.getItems().getData().get(0);
        Instant periodStart = toInstant(item.getCurrentPeriodStart());
        Instant periodEnd = toInstant(item.getCurrentPeriodEnd());

        Long planId = resolvePlanId(item.getPrice());

        subscriptionService.updateSubscription(
                subscription.getId(), status, periodStart, periodEnd,
                subscription.getCancelAtPeriodEnd(), planId
        );
    }

    private void handleCustomerSubscriptionDeleted(Subscription subscription) {
        if (subscription == null) {
            log.error("subscription object was null inside handleCustomerSubscriptionDeleted");
            return;
        }
        subscriptionService.cancelSubscription(subscription.getId());
    }

    private void handleInvoicePaid(Invoice invoice) {
        String subId = extractSubscriptionId(invoice);
        if (subId == null) return;

        try {
            Subscription subscription = Subscription.retrieve(subId);
            var item = subscription.getItems().getData().get(0);

            Instant periodStart = toInstant(item.getCurrentPeriodStart());
            Instant periodEnd = toInstant(item.getCurrentPeriodEnd());

            subscriptionService.renewSubscriptionPeriod(subId, periodStart, periodEnd);
        } catch (StripeException e) {
            throw new ExternalServiceException("Couldn't read subscription " + subId + " from Stripe", e);
        }
    }

    private void handleInvoicePaymentFailed(Invoice invoice) {
        String subId = extractSubscriptionId(invoice);
        if (subId == null) return;

        subscriptionService.markSubscriptionPastDue(subId);
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId).orElseThrow(() ->
                new ResourceNotFoundException("user", userId.toString()));
    }

    private SubscriptionStatus mapStripeStatusToEnum(String status) {
        return switch (status) {
            case "active" -> SubscriptionStatus.ACTIVE;
            case "trialing" -> SubscriptionStatus.TRIALING;
            case "past_due", "unpaid", "paused", "incomplete_expired" -> SubscriptionStatus.PAST_DUE;
            case "canceled" -> SubscriptionStatus.CANCELED;
            case "incomplete" -> SubscriptionStatus.INCOMPLETE;
            default -> {
                log.warn("Unmapped Stripe status: {}", status);
                yield null;
            }
        };
    }

    private Instant toInstant(Long epoch) {
        return epoch != null ? Instant.ofEpochSecond(epoch) : null;
    }

    private Long resolvePlanId(Price price) {
        if (price == null || price.getId() == null) return null;
        return planRepository.findByStripePriceId(price.getId())
                .map(Plan::getId)
                .orElse(null);
    }

    private String extractSubscriptionId(Invoice invoice) {
        var parent = invoice.getParent();
        if (parent == null) return null;

        var subDetails = parent.getSubscriptionDetails();
        if (subDetails == null) return null;

        return subDetails.getSubscription();
    }
}
