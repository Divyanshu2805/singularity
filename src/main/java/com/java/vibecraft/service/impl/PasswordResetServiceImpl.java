package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.auth.ForgotPasswordRequest;
import com.java.vibecraft.dto.auth.ResetPasswordRequest;
import com.java.vibecraft.entity.PasswordResetToken;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.error.BadRequestException;
import com.java.vibecraft.repository.PasswordResetTokenRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.enums.AuthAuditEventType;
import com.java.vibecraft.security.ClientInfo;
import com.java.vibecraft.service.AuthAuditService;
import com.java.vibecraft.service.PasswordResetMailer;
import com.java.vibecraft.util.Hashing;
import com.java.vibecraft.service.PasswordResetService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

@Slf4j
@Service
public class PasswordResetServiceImpl implements PasswordResetService {

    /** A second request inside this window is dropped silently, so the endpoint can't be used to flood an inbox. */
    static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);

    static final String INVALID_TOKEN_MESSAGE = "This password reset link is invalid or has expired. Please request a new one.";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetMailer mailer;
    private final AuthAuditService auditService;
    private final Duration tokenValidity;
    private final Clock clock;

    @Autowired
    public PasswordResetServiceImpl(UserRepository userRepository,
                                    PasswordResetTokenRepository tokenRepository,
                                    PasswordEncoder passwordEncoder,
                                    PasswordResetMailer mailer,
                                    AuthAuditService auditService,
                                    @Value("${password-reset.token-validity}") Duration tokenValidity) {
        this(userRepository, tokenRepository, passwordEncoder, mailer, auditService, tokenValidity, Clock.systemUTC());
    }

    /** For tests, which need to move the clock past a token's expiry. */
    PasswordResetServiceImpl(UserRepository userRepository,
                             PasswordResetTokenRepository tokenRepository,
                             PasswordEncoder passwordEncoder,
                             PasswordResetMailer mailer,
                             AuthAuditService auditService,
                             Duration tokenValidity,
                             Clock clock) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailer = mailer;
        this.auditService = auditService;
        this.tokenValidity = tokenValidity;
        this.clock = clock;
    }

    @Override
    @Transactional
    public void requestReset(ForgotPasswordRequest request, ClientInfo client) {
        Optional<User> found = userRepository.findByUsername(request.username().trim());
        if (found.isEmpty()) {
            // The same outcome as success, on purpose - see PasswordResetService#requestReset.
            log.info("Password reset requested for an email with no account");
            return;
        }
        User user = found.get();
        Instant now = clock.instant();

        boolean recentlySent = tokenRepository.findFirstByUserIdOrderByCreatedAtDesc(user.getId())
                .map(latest -> latest.getCreatedAt() != null && latest.getCreatedAt().isAfter(now.minus(RESEND_COOLDOWN)))
                .orElse(false);
        if (recentlySent) {
            log.info("Password reset for user {} skipped: one was sent less than {}s ago", user.getId(), RESEND_COOLDOWN.toSeconds());
            return;
        }

        // Only the newest link works: asking again retires any earlier one still sitting in the inbox.
        tokenRepository.deleteAllByUserId(user.getId());

        String token = newToken();
        tokenRepository.save(PasswordResetToken.builder()
                .user(user)
                .tokenHash(hash(token))
                .expiresAt(now.plus(tokenValidity))
                .build());

        mailer.sendResetLink(user.getUsername(), user.getName(), token, tokenValidity);
        auditService.record(AuthAuditEventType.LEGACY_PASSWORD_RESET_REQUESTED, user.getId(), user.getFirebaseUid(), client, null);
    }

    @Override
    @Transactional
    public void resetPassword(ResetPasswordRequest request, ClientInfo client) {
        PasswordResetToken resetToken = tokenRepository.findByTokenHash(hash(request.token().trim()))
                .orElseThrow(() -> new BadRequestException(INVALID_TOKEN_MESSAGE));

        User user = resetToken.getUser();
        if (!resetToken.getExpiresAt().isAfter(clock.instant())) {
            tokenRepository.deleteAllByUserId(user.getId());
            throw new BadRequestException(INVALID_TOKEN_MESSAGE);
        }

        user.setPassword(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        // Single use, and it takes any other outstanding link for the account with it.
        tokenRepository.deleteAllByUserId(user.getId());
        log.info("Password reset completed for user {}", user.getId());
        auditService.record(AuthAuditEventType.LEGACY_PASSWORD_RESET_COMPLETED, user.getId(), user.getFirebaseUid(), client, null);
    }

    /** 256 random bits, URL-safe so the token survives being a query parameter in an email link. */
    static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Plain SHA-256 is enough: the token is 256 random bits, so there's nothing to brute-force. */
    static String hash(String token) {
        return Hashing.sha256Hex(token);
    }
}
