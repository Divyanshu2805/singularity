package com.singularity.account.service.impl;

import com.singularity.account.entity.User;
import com.singularity.account.mapper.UserMapper;
import com.singularity.account.repository.RevokedSessionRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.security.SessionEvictionNotifier;
import com.singularity.account.service.AuthAuditService;
import com.singularity.common.security.AuthProperties;
import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.IdentityVerifier;
import com.singularity.common.security.SessionCache;
import com.singularity.common.security.SessionCookies;
import com.singularity.common.security.VerifiedIdentity;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Two first sign-ins arriving at once.
 *
 * <p>Handles: the request that loses the race to create the account signs in to the one the winner created, as an
 * existing user, instead of failing; a unique violation that is not that race is not swallowed; and a first sign-in
 * with nobody racing it still creates the account.
 */
class SessionServiceImplFirstSignInTest {

    private static final Instant NOW = Instant.parse("2026-10-08T10:00:00Z");

    private final UserRepository userRepository = mock(UserRepository.class);

    private final SessionServiceImpl service = new SessionServiceImpl(
            mock(IdentityVerifier.class), userRepository, mock(UserMapper.class), mock(SessionCookies.class),
            mock(SessionCache.class), mock(SessionEvictionNotifier.class), mock(RevokedSessionRepository.class),
            mock(AuthAuditService.class),
            new AuthProperties(new AuthProperties.SessionCookie("__Host-vc_session", Duration.ofDays(5), false), Duration.ofSeconds(60)),
            mock(AuthUtil.class), Clock.fixed(NOW, ZoneOffset.UTC));

    private static final VerifiedIdentity IDENTITY =
            new VerifiedIdentity("uid-1", "a@example.com", true, "A", "google.com", false, NOW.minusSeconds(10), NOW.plusSeconds(3600));

    @Test
    void theLoserOfTheRaceSignsInToTheAccountTheWinnerCreated() {
        User winner = User.builder().id(7L).username("a@example.com").firebaseUid("uid-1").build();
        when(userRepository.findByFirebaseUid("uid-1")).thenReturn(Optional.empty(), Optional.of(winner));
        when(userRepository.findByUsername("a@example.com")).thenReturn(Optional.empty());
        when(userRepository.findFirstByUsernameIgnoreCaseOrderByIdAsc("a@example.com")).thenReturn(Optional.empty());
        when(userRepository.save(any())).thenThrow(new DataIntegrityViolationException("duplicate key users_firebase_uid_key"));

        SessionServiceImpl.AccountResolution resolution = service.resolveAccount(IDENTITY);

        assertThat(resolution.user()).isSameAs(winner);
        assertThat(resolution.outcome()).isEqualTo(SessionServiceImpl.Outcome.EXISTING);
    }

    @Test
    void aUniqueViolationThatIsNotThatRaceIsNotSwallowed() {
        when(userRepository.findByFirebaseUid("uid-1")).thenReturn(Optional.empty());
        when(userRepository.findByUsername("a@example.com")).thenReturn(Optional.empty());
        when(userRepository.findFirstByUsernameIgnoreCaseOrderByIdAsc("a@example.com")).thenReturn(Optional.empty());
        DataIntegrityViolationException failure = new DataIntegrityViolationException("something else");
        when(userRepository.save(any())).thenThrow(failure);

        assertThatThrownBy(() -> service.resolveAccount(IDENTITY)).isSameAs(failure);
    }

    @Test
    void aFirstSignInWithNobodyRacingItCreatesTheAccount() {
        when(userRepository.findByFirebaseUid("uid-1")).thenReturn(Optional.empty());
        when(userRepository.findByUsername("a@example.com")).thenReturn(Optional.empty());
        when(userRepository.findFirstByUsernameIgnoreCaseOrderByIdAsc("a@example.com")).thenReturn(Optional.empty());
        when(userRepository.save(any())).thenAnswer(call -> call.getArgument(0));

        SessionServiceImpl.AccountResolution resolution = service.resolveAccount(IDENTITY);

        assertThat(resolution.outcome()).isEqualTo(SessionServiceImpl.Outcome.CREATED);
        assertThat(resolution.user().getFirebaseUid()).isEqualTo("uid-1");
    }
}
