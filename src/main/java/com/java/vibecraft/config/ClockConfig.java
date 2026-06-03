package com.java.vibecraft.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ClockConfig {

    /** Injected wherever time decides a security outcome (session expiry, rate limits), so tests can move it. */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
