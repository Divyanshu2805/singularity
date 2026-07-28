package com.vibecraft.common.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * The session-authentication settings every service reads from app.auth.
 *
 * <p>Handles: the session cookie's name, lifetime and secure flag, and how long a verified session may be trusted
 * before its revocation is re-checked with Firebase.
 */
@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
        SessionCookie sessionCookie,
        Duration revocationCheckInterval
) {
    public record SessionCookie(String name, Duration maxAge, boolean secure) {
    }
}
