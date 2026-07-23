package com.vibecraft.account.service.impl;

import com.vibecraft.account.entity.RevokedSession;
import com.vibecraft.account.mapper.UserMapper;
import com.vibecraft.account.repository.RevokedSessionRepository;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.common.security.AuthProperties;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.IdentityVerifier;
import com.vibecraft.common.security.SessionCache;
import com.vibecraft.common.security.SessionCookies;
import com.vibecraft.account.security.SessionEvictionNotifier;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.common.security.VerifiedIdentity;
import com.vibecraft.account.service.AuthAuditService;
import com.vibecraft.common.util.Hashing;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.BadCredentialsException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers that a sign-out reaches the other services, and in the right order.
 *
 * <p>account-service is the only service that hears about a sign-out, so it has to tell the others - and the
 * revocation must already be recorded, and Firebase must already have revoked for sign-out-everywhere, by the time
 * they drop their cache entry. Otherwise their very next check would still find the session valid and re-cache it.
 */
class SessionServiceImplSignOutTest {

    private static final Instant NOW = Instant.parse("2026-09-20T10:00:00Z");

    private final IdentityVerifier identityVerifier = mock(IdentityVerifier.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final SessionCookies sessionCookies = mock(SessionCookies.class);
    private final SessionCache sessionCache = mock(SessionCache.class);
    private final SessionEvictionNotifier notifier = mock(SessionEvictionNotifier.class);
    private final RevokedSessionRepository revokedSessionRepository = mock(RevokedSessionRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);

    private final SessionServiceImpl service = new SessionServiceImpl(
            identityVerifier, userRepository, mock(UserMapper.class), sessionCookies,
            sessionCache, notifier, revokedSessionRepository, mock(AuthAuditService.class),
            new AuthProperties(new AuthProperties.SessionCookie("vc_session", Duration.ofDays(5), false), Duration.ofSeconds(60)),
            authUtil, Clock.fixed(NOW, ZoneOffset.UTC));

    private static VerifiedIdentity identityExpiring(Instant expiresAt) {
        return new VerifiedIdentity("uid-1", "a@example.com", true, "A", "password", false, NOW.minusSeconds(60), expiresAt);
    }

    @Test
    @DisplayName("sign-out records the revocation first, then tells the other services to drop the session")
    void signOutNotifiesAfterTheRevocationIsRecorded() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        when(sessionCookies.read(request)).thenReturn(Optional.of("the-cookie"));
        when(identityVerifier.decodeSessionCookieOffline("the-cookie")).thenReturn(identityExpiring(NOW.plusSeconds(3600)));
        String hash = Hashing.sha256Hex("the-cookie");

        service.signOut(request, new MockHttpServletResponse());

        InOrder order = inOrder(sessionCache, revokedSessionRepository, notifier);
        order.verify(sessionCache).evict(hash);
        order.verify(revokedSessionRepository).save(any(RevokedSession.class));
        order.verify(notifier).evictSession(hash);
    }

    @Test
    @DisplayName("an already-expired cookie still has stale copies dropped elsewhere, but nothing new is revoked")
    void anExpiredCookieIsStillEvictedEverywhere() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        when(sessionCookies.read(request)).thenReturn(Optional.of("old-cookie"));
        when(identityVerifier.decodeSessionCookieOffline("old-cookie")).thenThrow(new BadCredentialsException("expired"));

        service.signOut(request, new MockHttpServletResponse());

        verify(revokedSessionRepository, never()).save(any());
        verify(notifier).evictSession(Hashing.sha256Hex("old-cookie"));
    }

    @Test
    @DisplayName("signing out with no cookie at all tells nobody anything")
    void noCookieNoNotification() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        when(sessionCookies.read(request)).thenReturn(Optional.empty());

        service.signOut(request, new MockHttpServletResponse());

        verify(notifier, never()).evictSession(any());
    }

    @Test
    @DisplayName("sign-out-everywhere has Firebase revoke first, then drops the user's sessions here, then everywhere else")
    void signOutEverywhereNotifiesAfterFirebaseRevokes() {
        when(authUtil.getCurrentPrincipal()).thenReturn(new UserPrincipal(7L, "a@example.com", "uid-1", List.of()));

        service.signOutEverywhere(new MockHttpServletRequest(), new MockHttpServletResponse());

        InOrder order = inOrder(identityVerifier, sessionCache, notifier);
        order.verify(identityVerifier).revokeAllSessions("uid-1");
        order.verify(sessionCache).evictUser("uid-1");
        order.verify(notifier).evictUser("uid-1");
    }
}
