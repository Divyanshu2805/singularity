package com.vibecraft.account.config;

import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/** Renamed from legacy-monolith's PaymentConfig as part of this service's self-explanatory-naming pass. */
@Configuration
public class StripeConfig {

    @Value("${stripe.api.secret}")
    private String stripeSecretKey;

    @PostConstruct
    public void init() {
        Stripe.apiKey = stripeSecretKey;
    }
}
