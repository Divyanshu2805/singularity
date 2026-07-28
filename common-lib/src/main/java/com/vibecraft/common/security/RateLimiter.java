package com.vibecraft.common.security;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * In-memory token buckets, one per rule and key.
 *
 * <p>Handles: refilling a key's allowance continuously over the rule's window, answering whether a request may
 * proceed, and telling the caller how many seconds until it could. Idle buckets are swept periodically so the map
 * cannot grow without bound.
 *
 * <p>Per process. A second instance of a service has its own buckets, so the effective limit multiplies with replicas
 * - Redis-backing is what this would need to be correct when scaled out.
 */
public class RateLimiter {

    public record Rule(String name, int capacity, Duration window) {
    }

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
