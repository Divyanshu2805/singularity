package com.singularity.workspace.service.impl;

import com.singularity.common.error.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limits how many builds one person may start in an hour.
 *
 * <p>Handles: refusing a start once the person has begun the allowed number in the last hour, saying how long until the
 * oldest of them ages out, and recording a start that was actually admitted. Checking and recording are separate so a
 * request that is refused for another reason - a build already running, too soon after the last - is not counted.
 *
 * <p>In memory and per instance, like the other limiters in these services: it closes the loop within one running copy
 * and not across replicas. The per-project spacing and the one-build-at-a-time rule are in the database and hold
 * everywhere; this is the cap on a person who owns many projects.
 */
@Component
public class PublishRateLimiter {

    private static final Duration WINDOW = Duration.ofHours(1);

    private final Map<Long, Deque<Instant>> starts = new ConcurrentHashMap<>();

    public void check(Long userId, int maxPerHour, Instant now) {
        Deque<Instant> recent = starts.computeIfAbsent(userId, id -> new ArrayDeque<>());
        synchronized (recent) {
            expire(recent, now);
            if (recent.size() >= maxPerHour) {
                long wait = Math.max(1, Duration.between(now, recent.peekFirst().plus(WINDOW)).toSeconds());
                throw new RateLimitExceededException(wait);
            }
        }
    }

    public void record(Long userId, Instant now) {
        Deque<Instant> recent = starts.computeIfAbsent(userId, id -> new ArrayDeque<>());
        synchronized (recent) {
            expire(recent, now);
            recent.addLast(now);
        }
    }

    private static void expire(Deque<Instant> recent, Instant now) {
        while (!recent.isEmpty() && recent.peekFirst().plus(WINDOW).isBefore(now)) {
            recent.removeFirst();
        }
    }
}
