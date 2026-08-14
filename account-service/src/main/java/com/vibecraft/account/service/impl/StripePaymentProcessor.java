package com.vibecraft.account.service.impl;

import com.vibecraft.account.dto.subscription.ChangePlanRequest;
import com.vibecraft.account.dto.subscription.CheckoutRequest;
import com.vibecraft.account.dto.subscription.CheckoutResponse;
import com.vibecraft.account.dto.subscription.ConfirmCheckoutRequest;
import com.vibecraft.account.dto.subscription.PortalResponse;
import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.vibecraft.account.entity.CheckoutIntent;
import com.vibecraft.account.entity.Plan;
import com.vibecraft.account.entity.User;
import com.vibecraft.account.enums.SubscriptionStatus;
import com.vibecraft.account.repository.CheckoutIntentRepository;
import com.vibecraft.account.repository.PlanRepository;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.account.repository.WebhookEventRepository;
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
import com.stripe.net.RequestOptions;
import com.stripe.param.SubscriptionUpdateParams;
import com.stripe.param.checkout.SessionCreateParams;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

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
 *
 * <p>Checkout-session creation goes through a CheckoutIntent: at most one outstanding intent per user (enforced by
 * its primary key), reused with the same Stripe idempotency key and Session id across double clicks and parallel
 * tabs until it goes stale or targets a different plan, so a retry can never mint a second Stripe session.
 *
 * <p>Every webhook delivery is claimed through WebhookEventRepository before its handler runs, by Stripe's own event
 * id: an already-PROCESSED event is skipped outright, one still stuck at RECEIVED (in flight, or its own handler
 * previously threw) is reclaimed. Each handler also carries the event's own creation time down into
 * SubscriptionService so a delayed or redelivered-out-of-order event can never overwrite newer state with older
 * state. switchPrice folds the cancellation-clearing and the price change into one Stripe update call, so a declined
 * card on an upgrade leaves the subscription entirely untouched rather than partially applied.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class StripePaymentProcessor implements PaymentProcessor {

    AuthUtil authUtil;
    PlanRepository planRepository;
    UserRepository userRepository;
    CheckoutIntentRepository checkoutIntentRepository;
    WebhookEventRepository webhookEventRepository;
    SubscriptionService subscriptionService;
    Clock clock;

    private static final Duration CHECKOUT_INTENT_TTL = Duration.ofHours(23);

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

        CheckoutIntent intent = reuseOrMintIntent(userId, plan.getId());
        String reusableUrl = reuseOpenSession(intent);
        if (reusableUrl != null) {
            return new CheckoutResponse(reusableUrl);
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
            RequestOptions options = RequestOptions.builder().setIdempotencyKey(intent.getIdempotencyKey()).build();
            Session session = Session.create(params.build(), options);
            checkoutIntentRepository.recordSession(userId, intent.getIdempotencyKey(), session.getId());
            return new CheckoutResponse(session.getUrl());
        } catch (StripeException e) {
            throw new ExternalServiceException("Stripe rejected the checkout session for user " + userId, e);
        }
    }

    /**
     * Atomically claims or refreshes the user's checkout intent (CheckoutIntentRepository.claimOrRefresh), then
     * re-reads it - always safe, since that statement guarantees a matching row exists afterward whether this call's
     * own candidate values won or an existing fresh one on the same plan did. Two concurrent callers for the same
     * user therefore always converge on the same idempotency key, never two different ones.
     */
    private CheckoutIntent reuseOrMintIntent(Long userId, Long planId) {
        String idempotencyKey = UUID.randomUUID().toString();
        Instant staleThreshold = clock.instant().minus(CHECKOUT_INTENT_TTL);
        checkoutIntentRepository.claimOrRefresh(userId, planId, idempotencyKey, staleThreshold);
        return checkoutIntentRepository.findById(userId)
                .orElseThrow(() -> new ExternalServiceException("Checkout intent for user " + userId + " vanished right after being claimed", null));
    }

    /**
     * If the intent already minted a Stripe session and that session is still open, returns its URL so a retried
     * request never asks Stripe to create a second one. Any Stripe failure here just falls through to minting a new
     * session under the same idempotency key.
     */
    private String reuseOpenSession(CheckoutIntent intent) {
        if (intent.getStripeSessionId() == null) {
            return null;
        }
        try {
            Session existing = Session.retrieve(intent.getStripeSessionId());
            if ("open".equals(existing.getStatus())) {
                return existing.getUrl();
            }
        } catch (StripeException e) {
            log.warn("Couldn't reuse checkout session {} for user {}, minting a new one",
                    intent.getStripeSessionId(), intent.getUserId(), e);
        }
        return null;
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

        syncFromStripe(subscriptionId, clock.instant());
        return subscriptionService.getCurrentSubscription();
    }

    /**
     * One Stripe update call carrying both the price-item change and (when applicable) clearing the scheduled
     * cancellation - never two calls. A declined card on an upgrade (payment_behavior=error_if_incomplete) then
     * fails the whole request atomically, so the renewal state can never end up changed while the price change that
     * was reported as failed silently wasn't.
     */
    private void switchPrice(Subscription stripeSubscription, Plan from, Plan to, boolean cancelling) throws StripeException {
        String itemId = stripeSubscription.getItems().getData().get(0).getId();
        boolean upgrade = amount(to) > amount(from);

        SubscriptionUpdateParams.Builder params = SubscriptionUpdateParams.builder()
                .addItem(SubscriptionUpdateParams.Item.builder().setId(itemId).setPrice(to.getStripePriceId()).build());

        if (cancelling) {
            params.setCancelAtPeriodEnd(false);
        }

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
    public void handleWebhookEvent(String type, StripeObject stripeObject, Map<String, String> metadata,
                                    String eventId, Instant eventCreatedAt) {
        log.info("Handling stripe event: {} ({})", type, eventId);

        if (!claimEvent(eventId, type, eventCreatedAt)) {
            log.info("Skipping already-processed webhook event {} ({})", eventId, type);
            return;
        }

        switch (type) {
            case "checkout.session.completed" -> handleCheckoutSessionCompleted((Session) stripeObject, metadata, eventCreatedAt);
            case "customer.subscription.updated" -> handleCustomerSubscriptionUpdated((Subscription) stripeObject, eventCreatedAt);
            case "customer.subscription.deleted" -> handleCustomerSubscriptionDeleted((Subscription) stripeObject, eventCreatedAt);
            case "invoice.paid" -> handleInvoicePaid((Invoice) stripeObject, eventCreatedAt);
            case "invoice.payment_failed" -> handleInvoicePaymentFailed((Invoice) stripeObject, eventCreatedAt);
            default -> log.debug("Ignoring the event: {}", type);
        }

        if (eventId != null) {
            webhookEventRepository.markProcessed(eventId);
        }
    }

    /**
     * Atomically claims eventId for processing: false when it was already fully PROCESSED (skip - a true duplicate
     * delivery), true otherwise, including reclaiming one still stuck at RECEIVED from a prior attempt that never
     * finished. An event with no id (shouldn't happen for a real Stripe delivery) is processed defensively rather
     * than silently dropped.
     */
    private boolean claimEvent(String eventId, String type, Instant eventCreatedAt) {
        if (eventId == null) {
            return true;
        }
        return webhookEventRepository.tryClaim(eventId, type, eventCreatedAt) > 0;
    }

    private void handleCheckoutSessionCompleted(Session session, Map<String, String> metadata, Instant eventCreatedAt) {
        if (session == null) {
            log.error("session object was null");
            return;
        }
        activateFromSession(session, metadata, eventCreatedAt);
    }

    private Long activateFromSession(Session session, Map<String, String> metadata, Instant eventCreatedAt) {
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

        subscriptionService.activateSubscription(userId, planId, subscriptionId, session.getCustomer(), eventCreatedAt);
        syncFromStripe(subscriptionId, clock.instant());
        checkoutIntentRepository.deleteById(userId);
        return userId;
    }

    /**
     * A live re-read of Stripe's current state, not itself a webhook event racing others - asOf is this call's own
     * "now" (the caller's clock.instant()), which always wins against any past event and becomes the new floor: any
     * later legitimate webhook necessarily has an event-creation time after it. On a Stripe failure the write that
     * preceded this call already happened - the local mirror is just unconfirmed - so this marks the row
     * sync-pending rather than silently leaving the caller's 200 response looking authoritative.
     */
    private void syncFromStripe(String subscriptionId, Instant asOf) {
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
                    resolvePlanId(item.getPrice()),
                    asOf);
        } catch (StripeException e) {
            log.error("Couldn't read subscription {} back from Stripe after a write succeeded - marking it sync-pending",
                    subscriptionId, e);
            subscriptionService.markSyncPending(subscriptionId);
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

        activateFromSession(session, session.getMetadata(), null);
        return subscriptionService.getCurrentSubscription();
    }

    private void handleCustomerSubscriptionUpdated(Subscription subscription, Instant eventCreatedAt) {
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
                subscription.getCancelAtPeriodEnd(), planId, eventCreatedAt
        );
    }

    private void handleCustomerSubscriptionDeleted(Subscription subscription, Instant eventCreatedAt) {
        if (subscription == null) {
            log.error("subscription object was null inside handleCustomerSubscriptionDeleted");
            return;
        }
        subscriptionService.cancelSubscription(subscription.getId(), eventCreatedAt);
    }

    private void handleInvoicePaid(Invoice invoice, Instant eventCreatedAt) {
        String subId = extractSubscriptionId(invoice);
        if (subId == null) return;

        try {
            Subscription subscription = Subscription.retrieve(subId);
            var item = subscription.getItems().getData().get(0);

            Instant periodStart = toInstant(item.getCurrentPeriodStart());
            Instant periodEnd = toInstant(item.getCurrentPeriodEnd());

            subscriptionService.renewSubscriptionPeriod(subId, periodStart, periodEnd, eventCreatedAt);
        } catch (StripeException e) {
            throw new ExternalServiceException("Couldn't read subscription " + subId + " from Stripe", e);
        }
    }

    private void handleInvoicePaymentFailed(Invoice invoice, Instant eventCreatedAt) {
        String subId = extractSubscriptionId(invoice);
        if (subId == null) return;

        subscriptionService.markSubscriptionPastDue(subId, eventCreatedAt);
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId).orElseThrow(() ->
                new ResourceNotFoundException("user", userId.toString()));
    }

    /**
     * BILL-05: unpaid and paused are dunning-exhausted/deliberately-suspended states with no grace period, not
     * delinquency - they must not map to PAST_DUE, which SubscriptionServiceImpl still treats as entitling within
     * its grace window. incomplete_expired means the checkout itself never completed, so it maps to CANCELED rather
     * than to any state that implies a subscription once existed to be delinquent on.
     */
    private SubscriptionStatus mapStripeStatusToEnum(String status) {
        return switch (status) {
            case "active" -> SubscriptionStatus.ACTIVE;
            case "trialing" -> SubscriptionStatus.TRIALING;
            case "past_due" -> SubscriptionStatus.PAST_DUE;
            case "unpaid" -> SubscriptionStatus.UNPAID;
            case "paused" -> SubscriptionStatus.PAUSED;
            case "canceled", "incomplete_expired" -> SubscriptionStatus.CANCELED;
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
