package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.auth.ForgotPasswordRequest;
import com.java.vibecraft.dto.auth.ResetPasswordRequest;
import com.java.vibecraft.entity.PasswordResetToken;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.error.BadRequestException;
import com.java.vibecraft.repository.PasswordResetTokenRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.security.ClientInfo;
import com.java.vibecraft.service.AuthAuditService;
import com.java.vibecraft.service.PasswordResetMailer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class PasswordResetServiceImplTest {

    private static final Instant NOW = Instant.parse("2026-09-16T10:00:00Z");
    private static final Duration VALIDITY = Duration.ofMinutes(30);
    private static final ClientInfo CLIENT = new ClientInfo("127.0.0.1", "test");

    private UserRepository userRepository;
    private PasswordResetTokenRepository tokenRepository;
    private PasswordEncoder passwordEncoder;
    private PasswordResetMailer mailer;
    private PasswordResetServiceImpl service;
    private User user;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        tokenRepository = mock(PasswordResetTokenRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        mailer = mock(PasswordResetMailer.class);
        service = new PasswordResetServiceImpl(userRepository, tokenRepository, passwordEncoder, mailer, mock(AuthAuditService.class), VALIDITY,
                Clock.fixed(NOW, ZoneOffset.UTC));
        user = User.builder().id(7L).username("ada@example.com").name("Ada").password("old-hash").build();
    }

    @Test
    void unknownEmailSendsNothingAndDoesNotFail() {
        when(userRepository.findByUsername("nobody@example.com")).thenReturn(Optional.empty());

        service.requestReset(new ForgotPasswordRequest("nobody@example.com"), CLIENT);

        verifyNoInteractions(tokenRepository, mailer);
    }

    @Test
    void storesOnlyTheHashAndEmailsTheRawToken() {
        when(userRepository.findByUsername("ada@example.com")).thenReturn(Optional.of(user));
        when(tokenRepository.findFirstByUserIdOrderByCreatedAtDesc(7L)).thenReturn(Optional.empty());

        service.requestReset(new ForgotPasswordRequest("ada@example.com"), CLIENT);

        ArgumentCaptor<PasswordResetToken> saved = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(tokenRepository).save(saved.capture());
        ArgumentCaptor<String> emailed = ArgumentCaptor.forClass(String.class);
        verify(mailer).sendResetLink(eq("ada@example.com"), eq("Ada"), emailed.capture(), eq(VALIDITY));

        assertThat(emailed.getValue()).hasSizeGreaterThanOrEqualTo(43);
        assertThat(saved.getValue().getTokenHash())
                .isEqualTo(PasswordResetServiceImpl.hash(emailed.getValue()))
                .isNotEqualTo(emailed.getValue());
        assertThat(saved.getValue().getExpiresAt()).isEqualTo(NOW.plus(VALIDITY));
        // Earlier links are retired before the new one is issued.
        verify(tokenRepository).deleteAllByUserId(7L);
    }

    @Test
    void aSecondRequestInsideTheCooldownIsDropped() {
        when(userRepository.findByUsername("ada@example.com")).thenReturn(Optional.of(user));
        PasswordResetToken recent = PasswordResetToken.builder().createdAt(NOW.minusSeconds(10)).build();
        when(tokenRepository.findFirstByUserIdOrderByCreatedAtDesc(7L)).thenReturn(Optional.of(recent));

        service.requestReset(new ForgotPasswordRequest("ada@example.com"), CLIENT);

        verify(tokenRepository, never()).save(any());
        verifyNoInteractions(mailer);
    }

    @Test
    void validTokenChangesThePasswordAndIsConsumed() {
        String token = PasswordResetServiceImpl.newToken();
        PasswordResetToken stored = PasswordResetToken.builder()
                .user(user).tokenHash(PasswordResetServiceImpl.hash(token)).expiresAt(NOW.plusSeconds(60)).build();
        when(tokenRepository.findByTokenHash(PasswordResetServiceImpl.hash(token))).thenReturn(Optional.of(stored));
        when(passwordEncoder.encode("new-password-123")).thenReturn("new-hash");

        service.resetPassword(new ResetPasswordRequest(token, "new-password-123"), CLIENT);

        assertThat(user.getPassword()).isEqualTo("new-hash");
        verify(userRepository).save(user);
        verify(tokenRepository).deleteAllByUserId(7L);
    }

    @Test
    void expiredTokenIsRejectedWithoutTouchingThePassword() {
        String token = PasswordResetServiceImpl.newToken();
        PasswordResetToken stored = PasswordResetToken.builder()
                .user(user).tokenHash(PasswordResetServiceImpl.hash(token)).expiresAt(NOW).build();
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> service.resetPassword(new ResetPasswordRequest(token, "new-password-123"), CLIENT))
                .isInstanceOf(BadRequestException.class);

        assertThat(user.getPassword()).isEqualTo("old-hash");
        verify(userRepository, never()).save(any());
    }

    @Test
    void unknownTokenIsRejected() {
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resetPassword(new ResetPasswordRequest("made-up", "new-password-123"), CLIENT))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("invalid or has expired");
    }
}
