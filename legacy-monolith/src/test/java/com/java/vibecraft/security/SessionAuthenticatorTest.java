package com.java.vibecraft.security;

import com.java.vibecraft.entity.User;
import com.java.vibecraft.error.ExternalServiceException;
import com.java.vibecraft.repository.RevokedSessionRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.util.Hashing;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.BadCredentialsException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class SessionAuthenticatorTest {

    private static final Instant NOW = Instant.parse("2026-09-16T10:00:00Z");
    private static final AuthProperties PROPS = new AuthProperties(
            new AuthProperties.SessionCookie("vc_session", Duration.ofDays(5), true),
            Duration.ofSeconds(60));

    private IdentityVerifier verifier;
    private RevokedSessionRepository revoked;
    private UserRepository users;
    private MutableClock clock;
    private SessionAuthenticator authenticator;

    @BeforeEach
    void setUp() {
        verifier = mock(IdentityVerifier.class);
        revoked = mock(RevokedSessionRepository.class);
        users = mock(UserRepository.class);
        clock = new MutableClock(NOW);
        authenticator = new SessionAuthenticator(verifier, new SessionCache(), revoked, users, PROPS, clock);

        when(verifier.verifySessionCookie("cookie")).thenReturn(
                new VerifiedIdentity("uid-1", "ada@example.com", true, "Ada", "password", false, NOW, NOW.plus(Duration.ofDays(5))));
        when(users.findByFirebaseUid("uid-1")).thenReturn(Optional.of(User.builder().id(7L).username("ada@example.com").build()));
    }

    @Test
    void verifiesOnceThenServesFromCacheUntilTheRecheckInterval() {
        assertThat(authenticator.authenticate("cookie")).map(UserPrincipal::userId).contains(7L);
        assertThat(authenticator.authenticate("cookie")).isPresent();
        verify(verifier, times(1)).verifySessionCookie("cookie");

        clock.now = NOW.plusSeconds(61);
        assertThat(authenticator.authenticate("cookie")).isPresent();
        verify(verifier, times(2)).verifySessionCookie("cookie");
    }

    @Test
    void revokedAfterTheIntervalMeansSignedOut() {
        authenticator.authenticate("cookie");
        when(verifier.verifySessionCookie("cookie")).thenThrow(new BadCredentialsException("revoked"));

        clock.now = NOW.plusSeconds(61);
        assertThat(authenticator.authenticate("cookie")).isEmpty();
    }

    @Test
    void aCookieSignedOutOfOnThisDeviceNeverReachesFirebase() {
        when(revoked.existsById(Hashing.sha256Hex("cookie"))).thenReturn(true);

        assertThat(authenticator.authenticate("cookie")).isEmpty();
        verifyNoInteractions(verifier);
    }

    @Test
    void validCookieForADeletedUserIsRejected() {
        when(users.findByFirebaseUid("uid-1")).thenReturn(Optional.of(User.builder().id(7L).deletedAt(NOW).build()));
        assertThat(authenticator.authenticate("cookie")).isEmpty();
    }

    @Test
    void firebaseBeingUnreachableFailsClosed() {
        when(verifier.verifySessionCookie("cookie")).thenThrow(new ExternalServiceException("down", null));
        assertThatThrownBy(() -> authenticator.authenticate("cookie")).isInstanceOf(ExternalServiceException.class);
    }

    @Test
    void neverCachesPastTheCookiesOwnExpiry() {
        when(verifier.verifySessionCookie("short")).thenReturn(
                new VerifiedIdentity("uid-1", "ada@example.com", true, "Ada", "password", false, NOW, NOW.plusSeconds(5)));
        authenticator.authenticate("short");

        clock.now = NOW.plusSeconds(6);
        when(verifier.verifySessionCookie("short")).thenThrow(new BadCredentialsException("expired"));
        assertThat(authenticator.authenticate("short")).isEmpty();
    }

    private static final class MutableClock extends Clock {
        Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
