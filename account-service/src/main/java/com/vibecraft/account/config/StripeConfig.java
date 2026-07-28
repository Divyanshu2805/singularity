package com.vibecraft.account.config;

import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Configures the Stripe SDK for the whole process.
 *
 * <p>Handles: setting the global API key from stripe.api.secret once the context is up. The Stripe Java SDK reads
 * that static field, so nothing else needs to hold a client.
 */
@Configuration
public class StripeConfig {

    @Value("${stripe.api.secret}")
    private String stripeSecretKey;

    @PostConstruct
    public void init() {
        Stripe.apiKey = stripeSecretKey;
    }
}
