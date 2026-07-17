package com.java.vibecraft.service;

import com.java.vibecraft.dto.subscription.ChangePlanRequest;
import com.java.vibecraft.dto.subscription.CheckoutRequest;
import com.java.vibecraft.dto.subscription.CheckoutResponse;
import com.java.vibecraft.dto.subscription.ConfirmCheckoutRequest;
import com.java.vibecraft.dto.subscription.PortalResponse;
import com.java.vibecraft.dto.subscription.SubscriptionResponse;
import com.stripe.model.StripeObject;

import java.util.Map;

public interface PaymentProcessor {

    CheckoutResponse createCheckoutSessionUrl(CheckoutRequest request);

    PortalResponse openCustomerPortal();

    void handleWebhookEvent(String type, StripeObject stripeObject, Map<String, String> metadata);

    /**
     * Settles a subscription straight from the checkout session the browser returned with, instead of waiting
     * for {@code checkout.session.completed} to arrive.
     *
     * <p><b>Why this exists.</b> Stripe delivers webhooks to a public URL; in local development there isn't
     * one, so without the Stripe CLI forwarding them the webhook never lands and a paid subscription stays
     * invisible forever. It is also a genuine safety net in production, where a webhook can be delayed past
     * the moment the user is looking at the page, or dropped outright.
     *
     * <p>Safe to call repeatedly and safe to race with the webhook: activation is guarded by
     * {@code existsByStripeSubscriptionId}, and the sync that follows only writes fields that changed.
     */
    SubscriptionResponse confirmCheckoutSession(ConfirmCheckoutRequest request);

    /**
     * Changes what an existing subscriber pays for, in place, on the subscription they already have.
     *
     * <p><b>Never through a new Checkout.</b> That is what switching plans used to do, and a Checkout creates a
     * second subscription alongside the first - the customer would have been billed for both.
     *
     * <ul>
     *   <li>To the <b>free plan</b>: cancels at the end of the current period. They keep what they paid for
     *   until then, and nothing is refunded or prorated.</li>
     *   <li>To the <b>plan they're already on</b> while it is set to cancel: resumes it.</li>
     *   <li>To a <b>dearer plan</b>: switches now and invoices the prorated difference immediately. If that
     *   payment fails, Stripe rejects the change and they stay where they were.</li>
     *   <li>To a <b>cheaper paid plan</b>: switches now, with the unused time credited to the next invoice.</li>
     * </ul>
     */
    SubscriptionResponse changePlan(ChangePlanRequest request);
}
