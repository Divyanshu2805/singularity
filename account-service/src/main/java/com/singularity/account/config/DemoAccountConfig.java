package com.singularity.account.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on the shared demo account's daily reset when {@code demo.enabled} is true.
 *
 * <p>Handles: enabling scheduling in account-service, which has no other scheduled work, only where the demo account
 * is wanted - production sets it; local development, the tests and the browser journey's stack do not.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "demo.enabled", havingValue = "true")
public class DemoAccountConfig {
}
