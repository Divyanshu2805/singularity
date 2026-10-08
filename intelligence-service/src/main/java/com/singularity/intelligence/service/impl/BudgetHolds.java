package com.singularity.intelligence.service.impl;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The parts of users' daily allowances that calls in progress are holding, kept in memory.
 *
 * <p>Handles: opening a hold when a call is admitted and closing it when the call ends; what each hold has been
 * granted and how much its call is estimated to have spent so far; adding those up per user; one lock per user, so
 * that admitting a call, growing a hold and settling one cannot interleave; and forgetting a hold nobody closed.
 *
 * <p>Holds live here and not in the database for the same reason a build turn does: a call in progress belongs to
 * this process, and if the process dies the call dies with it. A hold written to a table would outlive the call it
 * was for and keep that part of the allowance out of reach until the day ended. The cost is that two instances of the
 * service would not see each other's holds; a turn in progress already ties the service to one instance.
 *
 * <p>Nothing here knows what a user has spent or what their plan allows - that is the usage service's arithmetic,
 * done while it holds the user's lock.
 */
@Component
public class BudgetHolds {

    static final Duration ABANDONED_AFTER = Duration.ofHours(1);

    static final class Hold {
        final long id;
        final Long userId;
        final int wanted;
        final int limit;
        final boolean unlimited;
        final Instant openedAt;
        int granted;
        int inFlight;

        Hold(long id, Long userId, int wanted, int limit, boolean unlimited, int granted, Instant openedAt) {
            this.id = id;
            this.userId = userId;
            this.wanted = wanted;
            this.limit = limit;
            this.unlimited = unlimited;
            this.granted = granted;
            this.openedAt = openedAt;
        }
    }

    private final Map<Long, Hold> holds = new ConcurrentHashMap<>();
    private final Map<Long, Object> locks = new ConcurrentHashMap<>();
    private final AtomicLong nextId = new AtomicLong(1);
    private final Clock clock;

    public BudgetHolds(Clock clock) {
        this.clock = clock;
    }

    Object lockFor(Long userId) {
        return locks.computeIfAbsent(userId, id -> new Object());
    }

    Hold open(Long userId, int wanted, int limit, boolean unlimited, int granted) {
        Hold hold = new Hold(nextId.getAndIncrement(), userId, wanted, limit, unlimited, granted, clock.instant());
        holds.put(hold.id, hold);
        return hold;
    }

    Hold find(long holdId) {
        return holdId == 0 ? null : holds.get(holdId);
    }

    void close(long holdId) {
        holds.remove(holdId);
    }

    int heldFor(Long userId) {
        return sum(userId, true);
    }

    int inFlightFor(Long userId) {
        return sum(userId, false);
    }

    private int sum(Long userId, boolean granted) {
        Instant abandonedBefore = clock.instant().minus(ABANDONED_AFTER);
        long total = 0;
        for (Hold hold : holds.values()) {
            if (!hold.userId.equals(userId)) {
                continue;
            }
            if (hold.openedAt.isBefore(abandonedBefore)) {
                holds.remove(hold.id);
                continue;
            }
            if (granted) {
                total += hold.unlimited ? 0 : hold.granted;
            } else {
                total += hold.inFlight;
            }
        }
        return (int) Math.min(Integer.MAX_VALUE, total);
    }
}
