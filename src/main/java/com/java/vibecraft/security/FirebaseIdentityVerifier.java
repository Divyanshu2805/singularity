package com.java.vibecraft.security;

import com.google.firebase.ErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.SessionCookieOptions;
import com.java.vibecraft.error.ExternalServiceException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class FirebaseIdentityVerifier implements IdentityVerifier {

    /** Firebase's own "couldn't reach us / our fault" codes. Everything else is a problem with the token. */
    private static final Set<ErrorCode> UNAVAILABLE = EnumSet.of(
            ErrorCode.UNAVAILABLE, ErrorCode.INTERNAL, ErrorCode.UNKNOWN, ErrorCode.DEADLINE_EXCEEDED);

    private final FirebaseAuth firebaseAuth;

    @Override
    public VerifiedIdentity verifyIdToken(String idToken) {
        return call("verify the sign-in", () -> toIdentity(firebaseAuth.verifyIdToken(idToken, true)));
    }

    @Override
    public VerifiedIdentity verifySessionCookie(String sessionCookie) {
        return call("verify the session", () -> toIdentity(firebaseAuth.verifySessionCookie(sessionCookie, true)));
    }

    @Override
    public VerifiedIdentity decodeSessionCookieOffline(String sessionCookie) {
        return call("read the session", () -> toIdentity(firebaseAuth.verifySessionCookie(sessionCookie, false)));
    }

    @Override
    public String createSessionCookie(String idToken, Duration maxAge) {
        SessionCookieOptions options = SessionCookieOptions.builder().setExpiresIn(maxAge.toMillis()).build();
        return call("start the session", () -> firebaseAuth.createSessionCookie(idToken, options));
    }

    @Override
    public void revokeAllSessions(String uid) {
        call("sign out everywhere", () -> {
            firebaseAuth.revokeRefreshTokens(uid);
            return null;
        });
    }

    private <T> T call(String action, FirebaseCall<T> call) {
        try {
            return call.run();
        } catch (FirebaseAuthException ex) {
            if (ex.getAuthErrorCode() == null && UNAVAILABLE.contains(ex.getErrorCode())) {
                throw new ExternalServiceException("Couldn't " + action + " with Firebase", ex);
            }
            // Revoked, expired, malformed, disabled user... The detail stays in the log; the caller just learns
            // that this credential doesn't work.
            log.warn("Firebase rejected a credential while trying to {}: {} ({})", action, ex.getAuthErrorCode(), ex.getMessage());
            throw new BadCredentialsException("Your session is invalid or has expired. Please sign in again.");
        } catch (IllegalArgumentException ex) {
            // The SDK's answer to an empty or structurally broken token string.
            throw new BadCredentialsException("Your session is invalid or has expired. Please sign in again.");
        }
    }

    static VerifiedIdentity toIdentity(FirebaseToken token) {
        Map<String, Object> claims = token.getClaims();
        Map<?, ?> firebase = claims.get("firebase") instanceof Map<?, ?> map ? map : Map.of();
        return new VerifiedIdentity(
                token.getUid(),
                token.getEmail(),
                token.isEmailVerified(),
                token.getName(),
                firebase.get("sign_in_provider") instanceof String provider ? provider : null,
                firebase.get("sign_in_second_factor") != null,
                epochSeconds(claims.get("auth_time")),
                epochSeconds(claims.get("exp"))
        );
    }

    private static Instant epochSeconds(Object value) {
        return value instanceof Number number ? Instant.ofEpochSecond(number.longValue()) : null;
    }

    @FunctionalInterface
    private interface FirebaseCall<T> {
        T run() throws FirebaseAuthException;
    }
}
