package com.vibecraft.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * Turns on @Async for every service.
 *
 * <p>Handles: enabling asynchronous method execution, which then runs on Spring Boot's auto-configured
 * applicationTaskExecutor. Imported by CommonLibAutoConfiguration rather than component-scanned.
 */
@Configuration
@EnableAsync
public class AsyncConfig {
}
