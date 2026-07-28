package com.vibecraft.common.security;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Verified sessions, so revocation is checked with Firebase once per interval rather than on every request.
 *
 * <p>Handles: storing a caller against the hash of their cookie until a given instant, returning it while it is still
 * valid, and evicting either one session or every session of one user when account-service says so. Keyed by the
 * cookie's hash, so no cookie is held in memory.
 *
 * <p>A size threshold sweeps expired entries, and clears the map if that was not enough - a backstop against
 * unbounded growth, not a tuning knob. In-process only, so each replica caches independently.
 */
@Component
public class SessionCache {

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

    public void evictUser(String firebaseUid) {
        entries.values().removeIf(entry -> firebaseUid.equals(entry.principal().firebaseUid()));
    }
}
