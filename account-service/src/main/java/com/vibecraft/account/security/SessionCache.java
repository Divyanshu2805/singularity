package com.vibecraft.account.security;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Verified sessions, so revocation is checked with Firebase once per interval rather than on every request. Keyed by
 * the cookie's hash, so the cookies themselves aren't held in memory.
 *
 * <p>In-process only, same single-instance caveat as the rest of this codebase's in-memory state (see TODO.md).
 */
@Component
public class SessionCache {

    /** A backstop against unbounded growth, not a tuning knob: past this, expired entries are swept. */
    static final int SWEEP_THRESHOLD = 10_000;

    private record Entry(UserPrincipal principal, Instant validUntil) {
    }

    private final ConcurrentHashMap<String, Entry> entries = new ConcurrentHashMap<>();

    public Optional<UserPrincipal> get(String cookieHash, Instant now) {
        Entry entry = entries.get(cookieHash);
        if (entry == null) return Optional.empty();
        if (!entry.validUntil().isAfter(now)) {
            entries.remove(cookieHash, entry);
            return Optional.empty();
        }
        return Optional.of(entry.principal());
    }

    public void put(String cookieHash, UserPrincipal principal, Instant validUntil, Instant now) {
        if (entries.size() >= SWEEP_THRESHOLD) {
            entries.values().removeIf(entry -> !entry.validUntil().isAfter(now));
            if (entries.size() >= SWEEP_THRESHOLD) entries.clear();
        }
        entries.put(cookieHash, new Entry(principal, validUntil));
    }

    public void evict(String cookieHash) {
        entries.remove(cookieHash);
    }

    /** After "sign out everywhere": every cached session of that user must be re-checked, and will then fail. */
    public void evictUser(String firebaseUid) {
        entries.values().removeIf(entry -> firebaseUid.equals(entry.principal().firebaseUid()));
    }
}
