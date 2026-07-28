package com.vibecraft.account.service;

import com.vibecraft.account.dto.subscription.ChangePlanRequest;
import com.vibecraft.account.dto.subscription.CheckoutRequest;
import com.vibecraft.account.dto.subscription.CheckoutResponse;
import com.vibecraft.account.dto.subscription.ConfirmCheckoutRequest;
import com.vibecraft.account.dto.subscription.PortalResponse;
import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.stripe.model.StripeObject;

import java.util.Map;

/**
 * Everything this platform does with a payment provider, behind one interface.
 *
 * <p>Handles: starting a checkout session, opening the billing portal, settling a subscription straight from the
 * session the browser returned with, changing an existing subscriber's plan in place, and consuming the provider's
 * webhook events.
 */
public interface PaymentProcessor {

    CheckoutResponse createCheckoutSessionUrl(CheckoutRequest request);

    PortalResponse openCustomerPortal();

    void handleWebhookEvent(String type, StripeObject stripeObject, Map<String, String> metadata);

    SubscriptionResponse confirmCheckoutSession(ConfirmCheckoutRequest request);

    SubscriptionResponse changePlan(ChangePlanRequest request);
}
