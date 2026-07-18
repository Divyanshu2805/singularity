package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.auth.CreateSessionRequest;
import com.java.vibecraft.dto.auth.ReportSecurityEventRequest;
import com.java.vibecraft.dto.auth.SessionResponse;
import com.java.vibecraft.dto.auth.UserProfileResponse;
import com.java.vibecraft.entity.RevokedSession;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.enums.AuthAuditEventType;
import com.java.vibecraft.error.BadRequestException;
import com.java.vibecraft.error.ForbiddenException;
import com.java.vibecraft.mapper.UserMapper;
import com.java.vibecraft.repository.RevokedSessionRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.security.*;
import com.java.vibecraft.service.AuthAuditService;
import com.java.vibecraft.util.Hashing;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SessionServiceImplTest {

    private static final Instant NOW = Instant.parse("2026-09-16T10:00:00Z");
    private static final AuthProperties PROPS = new AuthProperties(
            new AuthProperties.SessionCookie("vc_session", Duration.ofDays(5), true),
            Duration.ofSeconds(60));

    private IdentityVerifier verifier;
    private UserRepository userRepository;
    private RevokedSessionRepository revokedSessionRepository;
    private AuthAuditService audit;
    private SessionCache sessionCache;
    private AuthUtil authUtil;
    private SessionServiceImpl service;

    @BeforeEach
    void setUp() {
        verifier = mock(IdentityVerifier.class);
        userRepository = mock(UserRepository.class);
        revokedSessionRepository = mock(RevokedSessionRepository.class);
        audit = mock(AuthAuditService.class);
        sessionCache = new SessionCache();
        authUtil = mock(AuthUtil.class);
        UserMapper userMapper = mock(UserMapper.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);

        when(passwordEncoder.encode(anyString())).thenReturn("random-hash");
        when(userMapper.toUserProfileResponse(any())).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            return new UserProfileResponse(u.getId(), u.getUsername(), u.getName());
        });
        when(userRepository.save(any())).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            if (u.getId() == null) u.setId(99L);
            return u;
        });
        when(userRepository.findByFirebaseUid(anyString())).thenReturn(Optional.empty());
        when(userRepository.findByUsername(anyString())).thenReturn(Optional.empty());
        when(userRepository.findFirstByUsernameIgnoreCaseOrderByIdAsc(anyString())).thenReturn(Optional.empty());
        when(verifier.createSessionCookie(anyString(), any())).thenReturn("session-cookie-value");

        service = new SessionServiceImpl(verifier, userRepository, userMapper, passwordEncoder, new SessionCookies(PROPS),
                sessionCache, revokedSessionRepository, audit, PROPS, authUtil, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static VerifiedIdentity identity(String uid, String email, boolean verified, Instant authTime) {
        return new VerifiedIdentity(uid, email, verified, "Ada Lovelace", "password", false, authTime, NOW.plusSeconds(3600));
    }

    @Test
    void createsAnHttpOnlyStrictSecureSessionCookieAndANewAccount() {
        when(verifier.verifyIdToken("id-token")).thenReturn(identity("uid-1", "ada@example.com", true, NOW.minusSeconds(10)));
        MockHttpServletResponse response = new MockHttpServletResponse();

        SessionResponse session = service.createSession(new CreateSessionRequest("id-token"), new MockHttpServletRequest(), response);

        String setCookie = response.getHeader("Set-Cookie");
        assertThat(setCookie).startsWith("vc_session=session-cookie-value")
                .contains("HttpOnly").contains("Secure").contains("SameSite=Strict").contains("Path=/")
                .contains("Max-Age=" + Duration.ofDays(5).toSeconds());
        assertThat(session.newAccount()).isTrue();
        assertThat(session.expiresAt()).isEqualTo(NOW.plus(Duration.ofDays(5)));
        verify(audit).record(eq(AuthAuditEventType.ACCOUNT_CREATED), eq(99L), eq("uid-1"), any(), any());
        verify(audit).record(eq(AuthAuditEventType.SIGN_IN), eq(99L), eq("uid-1"), any(), any());
    }

    @Test
    void refusesToMintASessionFromAnOldSignIn() {
        when(verifier.verifyIdToken("id-token"))
                .thenReturn(identity("uid-1", "ada@example.com", true, NOW.minus(SessionServiceImpl.MAX_SIGN_IN_AGE).minusSeconds(1)));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThatThrownBy(() -> service.createSession(new CreateSessionRequest("id-token"), new MockHttpServletRequest(), response))
                .isInstanceOf(BadCredentialsException.class);
        assertThat(response.getHeader("Set-Cookie")).isNull();
        verify(verifier, never()).createSessionCookie(anyString(), any());
        verify(audit).record(eq(AuthAuditEventType.SIGN_IN_REJECTED), any(), eq("uid-1"), any(), any());
    }

    @Test
    void unverifiedEmailCanNeitherSignInNorClaimAnExistingAccount() {
        User existing = User.builder().id(4L).username("victim@example.com").build();
        when(userRepository.findByUsername("victim@example.com")).thenReturn(Optional.of(existing));
        when(verifier.verifyIdToken("id-token")).thenReturn(identity("attacker", "victim@example.com", false, NOW));

        assertThatThrownBy(() -> service.createSession(new CreateSessionRequest("id-token"), new MockHttpServletRequest(), new MockHttpServletResponse()))
                .isInstanceOf(ForbiddenException.class);
        assertThat(existing.getFirebaseUid()).isNull();
        verify(userRepository, never()).save(any());
    }

    @Test
    void returningUserIsMatchedByUidEvenIfTheirEmailChanged() {
        User existing = User.builder().id(1L).username("old@example.com").firebaseUid("uid-1").build();
        when(userRepository.findByFirebaseUid("uid-1")).thenReturn(Optional.of(existing));

        var resolution = service.resolveAccount(identity("uid-1", "new@example.com", true, NOW));

        assertThat(resolution.outcome()).isEqualTo(SessionServiceImpl.Outcome.EXISTING);
        assertThat(resolution.user()).isSameAs(existing);
        verify(userRepository, never()).save(any());
    }

    @Test
    void legacyAccountWithTheSameVerifiedEmailIsLinkedAndKeepsItsPassword() {
        User existing = User.builder().id(2L).username("Ada@Example.com").password("hash").build();
        when(userRepository.findFirstByUsernameIgnoreCaseOrderByIdAsc("ada@example.com")).thenReturn(Optional.of(existing));

        var resolution = service.resolveAccount(identity("uid-2", "ada@example.com", true, NOW));

        assertThat(resolution.outcome()).isEqualTo(SessionServiceImpl.Outcome.LINKED);
        assertThat(existing.getFirebaseUid()).isEqualTo("uid-2");
        assertThat(existing.getPassword()).isEqualTo("hash");
    }

    @Test
    void emailAlreadyLinkedToADifferentUidIsRefused() {
        User existing = User.builder().id(5L).username("ada@example.com").firebaseUid("uid-original").build();
        when(userRepository.findByUsername("ada@example.com")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.resolveAccount(identity("uid-other", "ada@example.com", true, NOW)))
                .isInstanceOf(ForbiddenException.class);
        assertThat(existing.getFirebaseUid()).isEqualTo("uid-original");
    }

    @Test
    void deletedAccountGetsNoSession() {
        User deleted = User.builder().id(6L).username("gone@example.com").firebaseUid("uid-6").deletedAt(NOW).build();
        when(userRepository.findByFirebaseUid("uid-6")).thenReturn(Optional.of(deleted));
        when(verifier.verifyIdToken("id-token")).thenReturn(identity("uid-6", "gone@example.com", true, NOW));

        assertThatThrownBy(() -> service.createSession(new CreateSessionRequest("id-token"), new MockHttpServletRequest(), new MockHttpServletResponse()))
                .isInstanceOf(ForbiddenException.class);
        verify(verifier, never()).createSessionCookie(anyString(), any());
    }

    @Test
    void signOutRevokesThisCookieUntilItWouldHaveExpiredAndClearsIt() {
        Instant cookieExpiry = NOW.plus(Duration.ofDays(4));
        when(verifier.decodeSessionCookieOffline("cookie")).thenReturn(
                new VerifiedIdentity("uid-1", "ada@example.com", true, null, "password", false, NOW, cookieExpiry));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("vc_session", "cookie"));
        sessionCache.put(Hashing.sha256Hex("cookie"), new UserPrincipal(1L, "ada@example.com", "uid-1", List.of()), NOW.plusSeconds(60), NOW);
        MockHttpServletResponse response = new MockHttpServletResponse();

        service.signOut(request, response);

        ArgumentCaptor<RevokedSession> revoked = ArgumentCaptor.forClass(RevokedSession.class);
        verify(revokedSessionRepository).save(revoked.capture());
        assertThat(revoked.getValue().getCookieHash()).isEqualTo(Hashing.sha256Hex("cookie"));
        assertThat(revoked.getValue().getExpiresAt()).isEqualTo(cookieExpiry);
        assertThat(sessionCache.get(Hashing.sha256Hex("cookie"), NOW)).isEmpty();
        assertThat(response.getHeader("Set-Cookie")).startsWith("vc_session=;").contains("Max-Age=0");
    }

    @Test
    void signOutWithoutASessionStillSucceeds() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        service.signOut(new MockHttpServletRequest(), response);
        verifyNoInteractions(revokedSessionRepository);
        assertThat(response.getHeader("Set-Cookie")).contains("Max-Age=0");
    }

    @Test
    void signOutEverywhereRevokesInFirebaseAndDropsEveryCachedSession() {
        UserPrincipal principal = new UserPrincipal(1L, "ada@example.com", "uid-1", List.of());
        when(authUtil.getCurrentPrincipal()).thenReturn(principal);
        sessionCache.put("device-a", principal, NOW.plusSeconds(60), NOW);
        sessionCache.put("device-b", principal, NOW.plusSeconds(60), NOW);

        service.signOutEverywhere(new MockHttpServletRequest(), new MockHttpServletResponse());

        verify(verifier).revokeAllSessions("uid-1");
        assertThat(sessionCache.get("device-a", NOW)).isEmpty();
        assertThat(sessionCache.get("device-b", NOW)).isEmpty();
    }

    @Test
    void aClientCanOnlyReportItsOwnSecurityChangesOfAllowedTypes() {
        when(authUtil.getCurrentPrincipal()).thenReturn(new UserPrincipal(1L, "ada@example.com", "uid-1", List.of()));
        when(verifier.verifyIdToken("someone-else")).thenReturn(identity("uid-2", "eve@example.com", true, NOW));

        assertThatThrownBy(() -> service.reportSecurityEvent(
                new ReportSecurityEventRequest(AuthAuditEventType.MFA_ENROLLED, "someone-else"), new MockHttpServletRequest()))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.reportSecurityEvent(
                new ReportSecurityEventRequest(AuthAuditEventType.SIGN_IN, "anything"), new MockHttpServletRequest()))
                .isInstanceOf(BadRequestException.class);
        verifyNoInteractions(audit);
    }
}
