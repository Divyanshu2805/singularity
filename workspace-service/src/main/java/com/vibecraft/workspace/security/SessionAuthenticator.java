package com.vibecraft.workspace.security;

import com.vibecraft.common.dto.UserDto;
import com.vibecraft.common.util.Hashing;
import com.vibecraft.workspace.feign.AccountServiceClient;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Turns a session cookie into the signed-in user - or into nothing, if it no longer works for any reason.
 *
 * <p>Unlike account-service's identical-looking class, this can't resolve a Firebase uid - or a revoked-session
 * hash - against a local table: {@code User} and {@code RevokedSession} both live in account-service's own
 * database, not this one. Both checks go through account-service's internal API instead
 * ({@code AccountServiceClient.getUserByFirebaseUid}/{@code isSessionRevoked}), which is exactly what lets a
 * session cookie minted by account-service also authenticate a request to this service. A validated session is
 * cached in-process for {@code app.auth.revocation-check-interval}; account-service pushes an eviction here on
 * sign-out ({@code InternalSessionController}) so a signed-out cookie doesn't outlive that interval.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SessionAuthenticator {

    private final IdentityVerifier identityVerifier;
    private final SessionCache sessionCache;
    private final AccountServiceClient accountServiceClient;
    private final AuthProperties authProperties;
    private final Clock clock;

    /**
     * Empty for a cookie that is expired, revoked (sign-out, sign-out-everywhere, a password change, a disabled
     * account), or whose user is gone. Throws only when Firebase can't be reached to decide: it fails closed.
     */
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

        Instant recheckAt = now.plus(authProperties.revocationCheckInterval());
        Instant validUntil = identity.expiresAt() != null && identity.expiresAt().isBefore(recheckAt)
                ? identity.expiresAt() : recheckAt;
        sessionCache.put(cookieHash, principal.get(), validUntil, now);
        return principal;
    }

    private Optional<UserDto> resolveUser(String firebaseUid) {
        try {
            return Optional.of(accountServiceClient.getUserByFirebaseUid(firebaseUid));
        } catch (FeignException.NotFound e) {
            return Optional.empty();
        }
    }
}
