package com.singularity.workspace.service.impl;

import com.singularity.common.error.RateLimitExceededException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The cap on how many builds one person may start in an hour: refuses at the cap, says how long until the oldest ages
 * out, forgets what is older than the window, and counts only what was recorded.
 */
class PublishRateLimiterTest {

    private static final Instant NOW = Instant.parse("2026-10-08T12:00:00Z");

    private final PublishRateLimiter limiter = new PublishRateLimiter();

    @Test
    @DisplayName("up to the cap is fine, the next is refused")
    void refusesAtTheCap() {
        limiter.record(1L, NOW);
        limiter.record(1L, NOW.plusSeconds(10));

        assertThatThrownBy(() -> limiter.check(1L, 2, NOW.plusSeconds(20))).isInstanceOf(RateLimitExceededException.class);
        assertThatCode(() -> limiter.check(1L, 3, NOW.plusSeconds(20))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("the wait it names is the time until the oldest start leaves the hour")
    void namesTheWait() {
        limiter.record(1L, NOW);

        assertThatThrownBy(() -> limiter.check(1L, 1, NOW.plus(Duration.ofMinutes(20))))
                .isInstanceOfSatisfying(RateLimitExceededException.class,
                        e -> assertThat(e.getRetryAfterSeconds()).isBetween(2390L, 2410L));
    }

    @Test
    @DisplayName("starts older than an hour are forgotten")
    void forgetsOldStarts() {
        limiter.record(1L, NOW);

        assertThatCode(() -> limiter.check(1L, 1, NOW.plus(Duration.ofMinutes(61)))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("one person's starts do not count against another's")
    void peopleAreIndependent() {
        limiter.record(1L, NOW);

        assertThatCode(() -> limiter.check(2L, 1, NOW)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("checking does not record: only an admitted start counts")
    void checkingDoesNotCount() {
        for (int i = 0; i < 5; i++) {
            limiter.check(1L, 1, NOW);
        }

        assertThatCode(() -> limiter.check(1L, 1, NOW)).doesNotThrowAnyException();
    }
}
