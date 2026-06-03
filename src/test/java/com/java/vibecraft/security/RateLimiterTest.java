package com.java.vibecraft.security;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimiterTest {

    private static final RateLimiter.Rule FIVE_PER_MINUTE = new RateLimiter.Rule("test", 5, Duration.ofMinutes(1));

    @Test
    void allowsTheCapacityThenReportsHowLongToWait() {
        AtomicLong nanos = new AtomicLong();
        RateLimiter limiter = new RateLimiter(nanos::get);

        for (int i = 0; i < 5; i++) assertThat(limiter.tryAcquire(FIVE_PER_MINUTE, "ip:1")).isZero();

        // One token refills every 12s.
        assertThat(limiter.tryAcquire(FIVE_PER_MINUTE, "ip:1")).isEqualTo(12);
    }

    @Test
    void refillsContinuously() {
        AtomicLong nanos = new AtomicLong();
        RateLimiter limiter = new RateLimiter(nanos::get);
        for (int i = 0; i < 5; i++) limiter.tryAcquire(FIVE_PER_MINUTE, "ip:1");

        nanos.addAndGet(Duration.ofSeconds(12).toNanos());
        assertThat(limiter.tryAcquire(FIVE_PER_MINUTE, "ip:1")).isZero();
        assertThat(limiter.tryAcquire(FIVE_PER_MINUTE, "ip:1")).isPositive();
    }

    @Test
    void keysAndRulesAreIndependent() {
        AtomicLong nanos = new AtomicLong();
        RateLimiter limiter = new RateLimiter(nanos::get);
        for (int i = 0; i < 5; i++) limiter.tryAcquire(FIVE_PER_MINUTE, "ip:1");

        assertThat(limiter.tryAcquire(FIVE_PER_MINUTE, "ip:2")).isZero();
        assertThat(limiter.tryAcquire(new RateLimiter.Rule("other", 5, Duration.ofMinutes(1)), "ip:1")).isZero();
    }

    @Test
    void picksTheRulesForEachKindOfEndpoint() {
        assertThat(RateLimitFilter.rulesFor("POST", "/api/auth/session", "1.2.3.4", "ip:1.2.3.4"))
                .extracting(r -> r.rule().name() + "=" + r.key())
                .containsExactly("auth=ip:1.2.3.4", "api=ip:1.2.3.4");

        // AI spend is per user; the sign-in limit is always per IP.
        assertThat(RateLimitFilter.rulesFor("POST", "/api/projects/42/code/ask/stream", "1.2.3.4", "user:7"))
                .extracting(r -> r.rule().name() + "=" + r.key())
                .containsExactly("ai=user:7", "api=user:7");
        assertThat(RateLimitFilter.rulesFor("POST", "/api/chat/stream", "1.2.3.4", "user:7"))
                .extracting(r -> r.rule().name()).containsExactly("ai", "api");

        assertThat(RateLimitFilter.rulesFor("GET", "/api/projects", "1.2.3.4", "user:7"))
                .extracting(r -> r.rule().name()).containsExactly("api");
        // A GET to an auth path isn't a sign-in attempt.
        assertThat(RateLimitFilter.rulesFor("GET", "/api/auth/csrf", "1.2.3.4", "ip:1.2.3.4"))
                .extracting(r -> r.rule().name()).containsExactly("api");
    }
}
