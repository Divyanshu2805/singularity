package com.java.vibecraft.security;

import com.java.vibecraft.repository.RevokedSessionRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.util.Hashing;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Turns a session cookie into the signed-in user - or into nothing, if it no longer works for any reason. */
@Slf4j
@Component
@RequiredArgsConstructor
public class SessionAuthenticator {

    private final IdentityVerifier identityVerifier;
    private final SessionCache sessionCache;
    private final RevokedSessionRepository revokedSessionRepository;
    private final UserRepository userRepository;
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
