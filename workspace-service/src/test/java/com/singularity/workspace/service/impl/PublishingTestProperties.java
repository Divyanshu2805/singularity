package com.singularity.workspace.service.impl;

import com.singularity.workspace.config.PublishingProperties;

import java.time.Duration;
import java.util.Map;

/**
 * The publishing settings the unit tests run with: the same shape as application.yaml's, with limits small enough for
 * a test to pass them and waits short enough for a test not to wait.
 */
final class PublishingTestProperties {

    private PublishingTestProperties() {
    }

    static PublishingProperties defaults() {
        return with(10, 1);
    }

    static PublishingProperties with(int maxBuildsPerHour, int defaultLimit) {
        return new PublishingProperties("http", "localhost", 8090, "published-apps",
                Map.of("Free", 1, "Pro", 3, "Business", 10), defaultLimit, maxBuildsPerHour,
                Duration.ofSeconds(30), Duration.ofMillis(300), Duration.ofMinutes(4), Duration.ofMinutes(4),
                Duration.ofMinutes(1), 500, 20 * 1024 * 1024, 1000, 50L * 1024 * 1024,
                Duration.ofMinutes(2), Duration.ofSeconds(45), 8000);
    }
}
