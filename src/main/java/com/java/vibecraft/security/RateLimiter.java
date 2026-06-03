package com.java.vibecraft.security;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * In-memory token buckets: each key may spend {@code capacity} requests, refilled continuously over {@code window}.
 * Continuous refill rather than fixed windows, so there's no edge where a client gets two full allowances back to back.
 *
 * <p>Per instance. That's enough to blunt credential stuffing and runaway scripts against a single server; behind a
 * load balancer the effective limit is multiplied by the instance count, and a shared store (Redis) is the next step.
 */
public class RateLimiter {

    public record Rule(String name, int capacity, Duration window) {
    }

    /** Buckets untouched for this long are full again anyway, so they're dropped. */
    private static final long IDLE_NANOS = Duration.ofMinutes(15).toNanos();
    private static final int SWEEP_EVERY = 5_000;

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final AtomicLong calls = new AtomicLong();
    private final LongSupplier nanoClock;

    public RateLimiter(LongSupplier nanoClock) {
        this.nanoClock = nanoClock;
    }

    public RateLimiter() {
        this(System::nanoTime);
    }

    /** @return 0 if the request may proceed, otherwise how many seconds until it would be allowed */
    public long tryAcquire(Rule rule, String key) {
        long now = nanoClock.getAsLong();
        if (calls.incrementAndGet() % SWEEP_EVERY == 0) {
            buckets.values().removeIf(bucket -> bucket.idleSince(now) > IDLE_NANOS);
        }
        Bucket bucket = buckets.computeIfAbsent(rule.name() + ':' + key, k -> new Bucket(rule.capacity(), now));
        return bucket.tryConsume(rule, now);
    }

    private static final class Bucket {
        private double tokens;
        private long lastRefill;

        Bucket(int capacity, long now) {
            this.tokens = capacity;
            this.lastRefill = now;
        }

        synchronized long tryConsume(Rule rule, long now) {
            double perNano = (double) rule.capacity() / rule.window().toNanos();
            tokens = Math.min(rule.capacity(), tokens + (now - lastRefill) * perNano);
            lastRefill = now;
            if (tokens >= 1) {
                tokens -= 1;
                return 0;
            }
            double nanosUntilOne = (1 - tokens) / perNano;
            return Math.max(1, (long) Math.ceil(nanosUntilOne / 1_000_000_000d));
        }

        synchronized long idleSince(long now) {
            return now - lastRefill;
        }
    }
}
