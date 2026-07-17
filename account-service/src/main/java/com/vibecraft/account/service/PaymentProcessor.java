package com.vibecraft.account.service;

import com.vibecraft.account.dto.subscription.ChangePlanRequest;
import com.vibecraft.account.dto.subscription.CheckoutRequest;
import com.vibecraft.account.dto.subscription.CheckoutResponse;
import com.vibecraft.account.dto.subscription.ConfirmCheckoutRequest;
import com.vibecraft.account.dto.subscription.PortalResponse;
import com.vibecraft.account.dto.subscription.SubscriptionResponse;
import com.stripe.model.StripeObject;

import java.util.Map;

public interface PaymentProcessor {

    CheckoutResponse createCheckoutSessionUrl(CheckoutRequest request);

    PortalResponse openCustomerPortal();

    void handleWebhookEvent(String type, StripeObject stripeObject, Map<String, String> metadata);

    /** Settles a subscription straight from the checkout session the browser returned with. See docs/architecture/. */
    SubscriptionResponse confirmCheckoutSession(ConfirmCheckoutRequest request);

    /** Changes what an existing subscriber pays for, in place, on the subscription they already have. */
    SubscriptionResponse changePlan(ChangePlanRequest request);
}
