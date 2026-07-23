package com.vibecraft.account.service.impl;

import com.vibecraft.account.dto.auth.AuthAuditEventResponse;
import com.vibecraft.account.dto.auth.CreateSessionRequest;
import com.vibecraft.account.dto.auth.ReportSecurityEventRequest;
import com.vibecraft.account.dto.auth.SessionResponse;
import com.vibecraft.account.entity.RevokedSession;
import com.vibecraft.account.entity.User;
import com.vibecraft.account.enums.AuthAuditEventType;
import com.vibecraft.account.mapper.UserMapper;
import com.vibecraft.account.repository.RevokedSessionRepository;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.account.security.SessionEvictionNotifier;
import com.vibecraft.common.security.AuthProperties;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.ClientInfo;
import com.vibecraft.common.security.IdentityVerifier;
import com.vibecraft.common.security.SessionCache;
import com.vibecraft.common.security.SessionCookies;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.common.security.VerifiedIdentity;
import com.vibecraft.account.service.AuthAuditService;
import com.vibecraft.account.service.SessionService;
import com.vibecraft.common.error.BadRequestException;
import com.vibecraft.common.error.ForbiddenException;
import com.vibecraft.common.util.Hashing;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * The session lifecycle: turning a verified Firebase sign-in into a cookie, and ending sessions again.
 *
 * <p>Handles: verifying the ID token, refusing a sign-in that is too old or whose email is missing or unverified,
 * resolving the account (existing Firebase uid, then an unlinked local account with the same verified email, then
 * creating one), minting and writing the session cookie, and recording every outcome in the audit trail - including
 * rejections. Sign-out records the revocation, evicts the local cache and tells the other services;
 * sign-out-everywhere revokes at Firebase first and then does the same.
 *
 * <p>The maximum sign-in age is what stops an ID token lifted from somewhere being turned into a days-long session
 * long after the person actually signed in. Linking is refused when the matching local account already has a
 * different Firebase uid, so two identities can never merge silently. The eviction broadcast happens after the
 * revocation is recorded, so a service that misses its cache finds the session already revoked.
 *
 * <p>Deliberately not transactional: the Firebase round trips would hold a database connection for their whole
 * duration, and the one write in account resolution is a single save, atomic on its own.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionServiceImpl implements SessionService {

    static final Duration MAX_SIGN_IN_AGE = Duration.ofMinutes(5);

    static final int MAX_NAME_LENGTH = 30;

    private final IdentityVerifier identityVerifier;
    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final SessionCookies sessionCookies;
    private final SessionCache sessionCache;
    private final SessionEvictionNotifier sessionEvictionNotifier;
    private final RevokedSessionRepository revokedSessionRepository;
    private final AuthAuditService auditService;
    private final AuthProperties authProperties;
    private final AuthUtil authUtil;
    private final Clock clock;

    @Override
    public SessionResponse createSession(CreateSessionRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        ClientInfo client = ClientInfo.from(httpRequest);

        VerifiedIdentity identity;
        try {
            identity = identityVerifier.verifyIdToken(request.idToken());
        } catch (BadCredentialsException ex) {
            auditService.record(AuthAuditEventType.SIGN_IN_REJECTED, null, null, client, "invalid ID token");
            throw ex;
        }

        try {
            checkSignInIsUsable(identity);
            AccountResolution resolution = resolveAccount(identity);
            User user = resolution.user();
            if (user.getDeletedAt() != null) {
                throw new ForbiddenException("This account has been deleted.");
            }

            Duration maxAge = authProperties.sessionCookie().maxAge();
            String cookie = identityVerifier.createSessionCookie(request.idToken(), maxAge);
            sessionCookies.write(httpResponse, cookie, maxAge);

            if (resolution.outcome() == Outcome.CREATED) {
                auditService.record(AuthAuditEventType.ACCOUNT_CREATED, user.getId(), identity.uid(), client, identity.signInProvider());
            } else if (resolution.outcome() == Outcome.LINKED) {
                auditService.record(AuthAuditEventType.ACCOUNT_LINKED, user.getId(), identity.uid(), client, identity.signInProvider());
            }
            auditService.record(AuthAuditEventType.SIGN_IN, user.getId(), identity.uid(), client,
                    identity.signInProvider() + (identity.secondFactorUsed() ? " + second factor" : ""));

            return new SessionResponse(
                    userMapper.toUserProfileResponse(user),
                    clock.instant().plus(maxAge),
                    resolution.outcome() == Outcome.CREATED,
                    identity.secondFactorUsed());
        } catch (BadRequestException | ForbiddenException | BadCredentialsException ex) {
            Long userId = userRepository.findByFirebaseUid(identity.uid()).map(User::getId).orElse(null);
            auditService.record(AuthAuditEventType.SIGN_IN_REJECTED, userId, identity.uid(), client, ex.getMessage());
            throw ex;
        }
    }

    void checkSignInIsUsable(VerifiedIdentity identity) {
        if (identity.authTime() == null || identity.authTime().isBefore(clock.instant().minus(MAX_SIGN_IN_AGE))) {
            throw new BadCredentialsException("This sign-in is too old to start a session. Please sign in again.");
        }
        if (identity.email() == null) {
            throw new BadRequestException("This account has no email address, which VibeCraft needs.");
        }
        if (!identity.emailVerified()) {
            throw new ForbiddenException("Verify your email address before signing in. Check your inbox for the link.");
        }
    }

    enum Outcome { EXISTING, LINKED, CREATED }

    record AccountResolution(User user, Outcome outcome) {
    }

    AccountResolution resolveAccount(VerifiedIdentity identity) {
        Optional<User> byUid = userRepository.findByFirebaseUid(identity.uid());
        if (byUid.isPresent()) return new AccountResolution(byUid.get(), Outcome.EXISTING);

        Optional<User> byEmail = userRepository.findByUsername(identity.email())
                .or(() -> userRepository.findFirstByUsernameIgnoreCaseOrderByIdAsc(identity.email()));
        if (byEmail.isPresent()) {
            User user = byEmail.get();
            if (user.getFirebaseUid() != null) {
                throw new ForbiddenException("This email belongs to an account that's linked to a different sign-in. Contact support to recover it.");
            }
            user.setFirebaseUid(identity.uid());
            log.info("Linked Firebase uid to existing user {}", user.getId());
            return new AccountResolution(userRepository.save(user), Outcome.LINKED);
        }

        User created = userRepository.save(User.builder()
                .username(identity.email())
                .name(displayName(identity))
                .firebaseUid(identity.uid())
                .build());
        log.info("Created user {} from Firebase sign-in ({})", created.getId(), identity.signInProvider());
        return new AccountResolution(created, Outcome.CREATED);
    }

    @Override
    public void signOut(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        sessionCookies.read(httpRequest).ifPresent(cookie -> {
            String cookieHash = Hashing.sha256Hex(cookie);
            sessionCache.evict(cookieHash);
            try {
                VerifiedIdentity identity = identityVerifier.decodeSessionCookieOffline(cookie);
                Instant now = clock.instant();
                revokedSessionRepository.deleteExpired(now);
                if (identity.expiresAt() != null && identity.expiresAt().isAfter(now)) {
                    revokedSessionRepository.save(RevokedSession.builder().cookieHash(cookieHash).expiresAt(identity.expiresAt()).build());
                }
                Long userId = userRepository.findByFirebaseUid(identity.uid()).map(User::getId).orElse(null);
                auditService.record(AuthAuditEventType.SIGN_OUT, userId, identity.uid(), ClientInfo.from(httpRequest), null);
            } catch (BadCredentialsException ex) {
            }
            sessionEvictionNotifier.evictSession(cookieHash);
        });
        sessionCookies.clear(httpResponse);
    }

    @Override
    public void signOutEverywhere(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        UserPrincipal principal = authUtil.getCurrentPrincipal();
        if (principal.firebaseUid() == null) {
            throw new BadRequestException("Signing out everywhere needs a Firebase sign-in. Sign in again and retry.");
        }
        identityVerifier.revokeAllSessions(principal.firebaseUid());
        sessionCache.evictUser(principal.firebaseUid());
        sessionEvictionNotifier.evictUser(principal.firebaseUid());
        sessionCookies.clear(httpResponse);
        auditService.record(AuthAuditEventType.SIGN_OUT_EVERYWHERE, principal.userId(), principal.firebaseUid(),
                ClientInfo.from(httpRequest), null);
    }

    @Override
    public void reportSecurityEvent(ReportSecurityEventRequest request, HttpServletRequest httpRequest) {
        if (!request.type().isClientReportable()) {
            throw new BadRequestException("That event can't be reported by a client.");
        }
        UserPrincipal principal = authUtil.getCurrentPrincipal();
        VerifiedIdentity identity = identityVerifier.verifyIdToken(request.idToken());
        if (!identity.uid().equals(principal.firebaseUid())) {
            throw new ForbiddenException("That sign-in belongs to a different account.");
        }
        auditService.record(request.type(), principal.userId(), principal.firebaseUid(), ClientInfo.from(httpRequest),
                "reported by client");
    }

    @Override
    public List<AuthAuditEventResponse> recentSecurityEvents() {
        return auditService.recentFor(authUtil.getCurrentUserId());
    }

    static String displayName(VerifiedIdentity identity) {
        String name = identity.name() == null ? "" : identity.name().trim();
        if (name.isEmpty() && identity.email() != null) {
            name = identity.email().substring(0, Math.max(identity.email().indexOf('@'), 0));
        }
        if (name.isEmpty()) name = "VibeCraft user";
        return name.length() > MAX_NAME_LENGTH ? name.substring(0, MAX_NAME_LENGTH).trim() : name;
    }
}
