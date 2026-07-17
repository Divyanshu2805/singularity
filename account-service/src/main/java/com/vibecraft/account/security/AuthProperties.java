package com.vibecraft.account.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
        SessionCookie sessionCookie,
        Duration revocationCheckInterval,
        Legacy legacy
) {
    public record SessionCookie(String name, Duration maxAge, boolean secure) {
    }

    public record Legacy(boolean enabled) {
    }
}
