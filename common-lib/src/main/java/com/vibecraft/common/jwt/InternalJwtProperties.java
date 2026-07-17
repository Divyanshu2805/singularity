package com.vibecraft.common.jwt;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * The internal JWT is minted once by gateway-service per inbound request (after it verifies the browser's
 * Firebase session cookie) and forwarded, unmodified, to every downstream service that request touches via
 * {@code FeignClientInterceptor}. Short-lived on purpose — it only needs to outlive one request's fan-out,
 * not a user's session.
 */
@ConfigurationProperties(prefix = "internal-jwt")
public record InternalJwtProperties(
        String secretKey,
        Duration expiration
) {
    public InternalJwtProperties {
        if (expiration == null) {
            expiration = Duration.ofMinutes(2);
        }
    }
}
