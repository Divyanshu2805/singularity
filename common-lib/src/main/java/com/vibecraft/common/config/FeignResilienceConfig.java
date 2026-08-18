package com.vibecraft.common.config;

import feign.Retryer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The retry policy every outbound Feign call in this codebase gets by default.
 *
 * <p>Handles: bounding how many times a Feign call is retried, and how long between attempts. Feign only ever
 * retries a {@code RetryableException} - a connect/read timeout or a connection failure - never a decoded HTTP
 * response, so a downstream service's real 4xx/5xx is still surfaced once and only once; nothing here retries a
 * write blindly. Per-service {@code feign.client.config.default.connectTimeout}/{@code .readTimeout} (each
 * service's application.yaml) bounds how long a single attempt can take, which is what actually stops one slow
 * dependency (account-service, on session authentication's Feign path) from stalling most requests through it.
 */
@Configuration
public class FeignResilienceConfig {

    @Bean
    public Retryer feignRetryer() {
        return new Retryer.Default(100, 1000, 3);
    }
}
