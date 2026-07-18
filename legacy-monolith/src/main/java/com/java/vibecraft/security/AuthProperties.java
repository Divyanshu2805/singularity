package com.java.vibecraft.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
        SessionCookie sessionCookie,
        Duration revocationCheckInterval
) {
    public record SessionCookie(String name, Duration maxAge, boolean secure) {
    }
}
