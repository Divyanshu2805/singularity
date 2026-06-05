package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.subscription.ChangePlanRequest;
import com.java.vibecraft.dto.subscription.CheckoutRequest;
import com.java.vibecraft.dto.subscription.CheckoutResponse;
import com.java.vibecraft.dto.subscription.ConfirmCheckoutRequest;
import com.java.vibecraft.dto.subscription.PortalResponse;
import com.java.vibecraft.dto.subscription.SubscriptionResponse;
import com.java.vibecraft.entity.Plan;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.enums.SubscriptionStatus;
import com.java.vibecraft.error.BadRequestException;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.repository.PlanRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.PaymentProcessor;
import com.java.vibecraft.service.SubscriptionService;
import com.stripe.exception.CardException;
import com.stripe.exception.StripeException;
import com.stripe.model.*;
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

        // A Checkout always creates a *new* subscription. For someone who already has one, that is a second,
        // concurrent subscription billed on top of the first - which is exactly what "switching plans" used to
        // do from the pricing page. Existing subscribers change plan through changePlan instead.
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
                // Real routes in the SPA. These used to be /success.html and /cancel.html - static pages that
                // exist nowhere - pointed at `client.url`, which was the *backend's* port. Every completed
                // payment landed on a 404.
                .setSuccessUrl(frontendUrl + "/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}")
                .setCancelUrl(frontendUrl + "/pricing?checkout=cancelled")
                .putMetadata("user_id", userId.toString())
                .putMetadata("plan_id", plan.getId().toString());

        try {
            String stripeCustomerId = user.getStripeCustomerId();
            if(stripeCustomerId == null || stripeCustomerId.isEmpty()) {
                params.setCustomerEmail(user.getUsername());
            } else {
                params.setCustomer(stripeCustomerId);
            }
            Session session = Session.create(params.build());
            return new CheckoutResponse(session.getUrl());
        } catch (StripeException e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public PortalResponse openCustomerPortal() {
        Long userId = authUtil.getCurrentUserId();
        User user = getUser(userId);
        String stripeCustomerId = user.getStripeCustomerId();

        if(stripeCustomerId == null || stripeCustomerId.isEmpty()) {
            throw new BadRequestException("User does not have a Stripe Customer Id, UserId:"+userId);
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
            throw new RuntimeException(e);
        }
    }

    @Override
    public SubscriptionResponse changePlan(ChangePlanRequest request) {
        Long userId = authUtil.getCurrentUserId();
        Plan target = planRepository.findById(request.planId()).orElseThrow(() ->
                new ResourceNotFoundException("Plan", request.planId().toString()));

        com.java.vibecraft.entity.Subscription current = subscriptionService.getActiveSubscription(userId)
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
                    // At the end of the period, not now: they've paid for it, so they keep it until then. The
                    // local row flips to CANCELED when Stripe sends customer.subscription.deleted at that moment.
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
            // Only reachable on an upgrade: ERROR_IF_INCOMPLETE makes Stripe reject the whole change when the
            // prorated charge fails, so nothing has moved and the message can say exactly that.
            log.warn("Plan change for user {} declined: {}", userId, e.getMessage());
            throw new BadRequestException("Your card was declined, so your plan hasn't changed. Update your card in Manage billing and try again.");
        } catch (StripeException e) {
            log.error("Couldn't change plan for user {} on subscription {}", userId, subscriptionId, e);
            throw new BadRequestException("Couldn't change your plan right now. Please try again.");
        }

        // Written through immediately rather than left to customer.subscription.updated, so the page the user is
        // looking at reflects the change as soon as the request returns - and so it works without webhooks.
        syncFromStripe(subscriptionId);
        return subscriptionService.getCurrentSubscription();
    }

    /**
     * Moves a subscription's single item to another price.
     *
     * <p>Upgrades invoice the prorated difference straight away with {@code ERROR_IF_INCOMPLETE}, so a declined
     * card rejects the change outright instead of leaving someone on a bigger plan they haven't paid for.
     * Downgrades only create the proration, which Stripe credits against the next invoice.
     */
    private void switchPrice(Subscription stripeSubscription, Plan from, Plan to, boolean cancelling) throws StripeException {
        String itemId = stripeSubscription.getItems().getData().get(0).getId();
        boolean upgrade = amount(to) > amount(from);

        if (cancelling) {
            // Choosing another paid plan is a decision to stay, so the pending cancellation goes. Its own call, so
            // it isn't mixed with the error_if_incomplete payment behaviour an upgrade uses.
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
        if(session == null) {
            log.error("session object was null");
            return;
        }
        activateFromSession(session, metadata);
    }

    /**
     * Turns a completed checkout session into an active subscription. Shared by the webhook and by
     * {@link #confirmCheckoutSession}, so both settle a subscription exactly the same way.
     *
     * <p>The metadata is parsed defensively: it is echoed back by Stripe rather than read from our database,
     * and a missing or malformed value used to reach {@code Long.parseLong(null)} and throw NPE out of the
     * webhook - which Stripe reads as a failure and retries forever.
     */
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
        if(user.getStripeCustomerId() == null) {
            user.setStripeCustomerId(session.getCustomer());
            userRepository.save(user);
        }

        subscriptionService.activateSubscription(userId, planId, subscriptionId, session.getCustomer());

        // Activation alone leaves the row INCOMPLETE with no period dates, waiting on a
        // `customer.subscription.updated` whose arrival and ordering are not guaranteed. Reading the
        // subscription back from Stripe now means the user sees an active plan with a real renewal date the
        // moment they return, rather than a pending one that fixes itself at some point.
        syncFromStripe(subscriptionId);
        return userId;
    }

    /** Pulls a subscription's current status and period from Stripe and writes them through. */
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
            // Not fatal: the subscription row exists, and the next webhook will fill in what's missing.
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

    /**
     * Confirms a checkout the browser has just returned from. See {@code PaymentProcessor} for why this
     * exists alongside the webhook.
     */
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

        // The session id arrives in a URL the user could have edited or been handed. It proves nothing on its
        // own, so both facts are checked against Stripe: that it was actually paid, and that it was this
        // caller's checkout - otherwise one account could activate a subscription somebody else paid for.
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
        if(subId == null) return;

        try {
            Subscription subscription = Subscription.retrieve(subId); //sdk calling the Stripe server
            var item = subscription.getItems().getData().get(0);

            Instant periodStart = toInstant(item.getCurrentPeriodStart());
            Instant periodEnd = toInstant(item.getCurrentPeriodEnd());

            subscriptionService.renewSubscriptionPeriod(
                    subId,
                    periodStart,
                    periodEnd
            );

        } catch (StripeException e) {
            throw new RuntimeException(e);
        }

    }

    private void handleInvoicePaymentFailed(Invoice invoice) {
        String subId = extractSubscriptionId(invoice);
        if(subId == null) return;

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
