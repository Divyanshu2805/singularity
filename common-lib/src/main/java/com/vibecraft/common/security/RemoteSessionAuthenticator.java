package com.vibecraft.common.security;

import com.vibecraft.common.dto.UserDto;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.common.util.Hashing;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Session authentication for a service that owns neither User nor RevokedSession - every service except
 * account-service.
 *
 * <p>Handles: the cache-first path (a validated session is cached in-process for app.auth.revocation-check-interval,
 * keyed by the cookie's hash so no cookie is held in memory), the revocation check and the uid-to-user resolution,
 * both over account-service's internal API, and the Firebase cookie verification in between.
 *
 * <p>Asking account-service rather than a local table is what lets a cookie minted there authenticate a request here.
 * account-service pushes an eviction on sign-out, so a signed-out cookie does not outlive the cache interval.
 */
@Slf4j
@RequiredArgsConstructor
public class RemoteSessionAuthenticator implements SessionAuthenticator {

    private final IdentityVerifier identityVerifier;
    private final SessionCache sessionCache;
    private final AccountServiceClient accountServiceClient;
    private final AuthProperties authProperties;
    private final Clock clock;

    @Override
    public Optional<UserPrincipal> authenticate(String sessionCookie) {
        Instant now = clock.instant();
        String cookieHash = Hashing.sha256Hex(sessionCookie);

        Optional<UserPrincipal> cached = sessionCache.get(cookieHash, now);
        if (cached.isPresent()) return cached;

        if (accountServiceClient.isSessionRevoked(cookieHash)) return Optional.empty();

        VerifiedIdentity identity;
        try {
            identity = identityVerifier.verifySessionCookie(sessionCookie);
        } catch (BadCredentialsException ex) {
            return Optional.empty();
        }

        Optional<UserPrincipal> principal = resolveUser(identity.uid())
                .map(user -> new UserPrincipal(user.id(), user.username(), identity.uid(), List.of()));
        if (principal.isEmpty()) {
            log.warn("Valid session cookie for Firebase uid {} with no active account-service user", identity.uid());
            return Optional.empty();
        }

        sessionCache.put(cookieHash, principal.get(), validUntil(identity, now), now);
        return principal;
    }

    private Optional<UserDto> resolveUser(String firebaseUid) {
        try {
            return Optional.of(accountServiceClient.getUserByFirebaseUid(firebaseUid));
        } catch (FeignException.NotFound e) {
            return Optional.empty();
        }
    }

    private Instant validUntil(VerifiedIdentity identity, Instant now) {
        Instant recheckAt = now.plus(authProperties.revocationCheckInterval());
        return identity.expiresAt() != null && identity.expiresAt().isBefore(recheckAt)
                ? identity.expiresAt() : recheckAt;
    }
}
