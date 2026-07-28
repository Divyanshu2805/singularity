package com.vibecraft.account.security;

import com.vibecraft.account.repository.RevokedSessionRepository;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.common.security.AuthProperties;
import com.vibecraft.common.security.IdentityVerifier;
import com.vibecraft.common.security.SessionAuthenticator;
import com.vibecraft.common.security.SessionCache;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.common.security.VerifiedIdentity;
import com.vibecraft.common.util.Hashing;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Session authentication for account-service, which owns the User and REVOKED_SESSION tables.
 *
 * <p>Handles: the same cache-first flow as the remote implementation - cached principal, revocation check, Firebase
 * cookie verification, uid-to-user resolution - but reading both tables directly instead of calling an internal API,
 * and additionally excluding a soft-deleted user.
 *
 * <p>Because this bean exists, the auto-configuration's remote implementation is not contributed here.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LocalSessionAuthenticator implements SessionAuthenticator {

    private final IdentityVerifier identityVerifier;
    private final SessionCache sessionCache;
    private final RevokedSessionRepository revokedSessionRepository;
    private final UserRepository userRepository;
    private final AuthProperties authProperties;
    private final Clock clock;

    @Override
    public Optional<UserPrincipal> authenticate(String sessionCookie) {
        Instant now = clock.instant();
        String cookieHash = Hashing.sha256Hex(sessionCookie);

        Optional<UserPrincipal> cached = sessionCache.get(cookieHash, now);
        if (cached.isPresent()) return cached;

        if (revokedSessionRepository.existsById(cookieHash)) return Optional.empty();

        VerifiedIdentity identity;
        try {
            identity = identityVerifier.verifySessionCookie(sessionCookie);
        } catch (BadCredentialsException ex) {
            return Optional.empty();
        }

        Optional<UserPrincipal> principal = userRepository.findByFirebaseUid(identity.uid())
                .filter(user -> user.getDeletedAt() == null)
                .map(user -> new UserPrincipal(user.getId(), user.getUsername(), identity.uid(), List.of()));
        if (principal.isEmpty()) {
            log.warn("Valid session cookie for Firebase uid {} with no active local user", identity.uid());
            return Optional.empty();
        }

        Instant recheckAt = now.plus(authProperties.revocationCheckInterval());
        Instant validUntil = identity.expiresAt() != null && identity.expiresAt().isBefore(recheckAt)
                ? identity.expiresAt() : recheckAt;
        sessionCache.put(cookieHash, principal.get(), validUntil, now);
        return principal;
    }
}
