package com.vibecraft.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * The Clock every service injects wherever time decides an outcome.
 *
 * <p>Handles: exposing a single system-UTC Clock bean. Injecting it rather than calling Instant.now() directly is
 * what lets a test move time - session expiry, revocation re-checks and rate limits all read it.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
