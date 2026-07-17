package com.vibecraft.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/** Enables {@code @Async}, which runs on Spring Boot's auto-configured {@code applicationTaskExecutor}. */
@Configuration
@EnableAsync
public class AsyncConfig {
}
