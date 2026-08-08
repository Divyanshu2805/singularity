package com.vibecraft.workspace.util;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers CODE_REVIEW.md SEC-06's token: a preview's hostname alone is a permanent bearer link the proxy has no way
 * to check, so this signed, expiring token is what actually bounds how long a URL keeps working.
 *
 * <p>proxy/index.js re-implements this exact scheme in Node - these cases (in particular the message format
 * `hostname + "." + expiresAt` and the hex-encoded HMAC-SHA256) are the contract the two sides must agree on.
 */
class PreviewAccessTokenTest {

    private static final String SECRET = "test-preview-token-secret";
    private static final String HOSTNAME = "p7-ab3x9k2m7q.localhost";
    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

    @Test
    void aFreshlyMintedTokenIsValid() {
        String token = PreviewAccessToken.mint(SECRET, HOSTNAME, NOW, Duration.ofHours(6));

        assertThat(PreviewAccessToken.isValid(SECRET, HOSTNAME, token, NOW)).isTrue();
    }

    @Test
    void aTokenIsStillValidJustBeforeItExpires() {
        String token = PreviewAccessToken.mint(SECRET, HOSTNAME, NOW, Duration.ofHours(6));

        assertThat(PreviewAccessToken.isValid(SECRET, HOSTNAME, token, NOW.plus(Duration.ofHours(6)).minusSeconds(1)))
                .isTrue();
    }

    @Test
    void anExpiredTokenIsRejected() {
        String token = PreviewAccessToken.mint(SECRET, HOSTNAME, NOW, Duration.ofHours(6));

        assertThat(PreviewAccessToken.isValid(SECRET, HOSTNAME, token, NOW.plus(Duration.ofHours(6)).plusSeconds(1)))
                .isFalse();
    }

    @Test
    void aTokenMintedForOneHostnameDoesNotValidateForAnother() {
        String token = PreviewAccessToken.mint(SECRET, HOSTNAME, NOW, Duration.ofHours(6));

        assertThat(PreviewAccessToken.isValid(SECRET, "p8-different.localhost", token, NOW)).isFalse();
    }

    @Test
    void aTokenSignedWithADifferentSecretIsRejected() {
        String token = PreviewAccessToken.mint(SECRET, HOSTNAME, NOW, Duration.ofHours(6));

        assertThat(PreviewAccessToken.isValid("wrong-secret", HOSTNAME, token, NOW)).isFalse();
    }

    @Test
    void aTamperedExpiryIsRejectedEvenIfExtendedIntoTheFuture() {
        String token = PreviewAccessToken.mint(SECRET, HOSTNAME, NOW, Duration.ofHours(6));
        int dot = token.indexOf('.');
        String tamperedToExpireLater = (Long.parseLong(token.substring(0, dot)) + 1_000_000) + token.substring(dot);

        assertThat(PreviewAccessToken.isValid(SECRET, HOSTNAME, tamperedToExpireLater, NOW)).isFalse();
    }

    @Test
    void matchesTheNodeProxysIndependentlyComputedHmac() {
        // Ground truth from `crypto.createHmac('sha256', secret).update(hostname + "." + expiresAt).digest('hex')`
        // in Node - see proxy/index.js's verifyToken. If this ever fails, the two implementations have drifted and
        // every preview link will 401 in production despite passing this file's other tests.
        String token = PreviewAccessToken.mint(SECRET, HOSTNAME, NOW, Duration.ofHours(6));

        assertThat(token).isEqualTo(
                "1767247200.51c962bf3bc39653a8f98ec0f340da4d4e4e2aa5cf08dd944da811edeb30e11c");
    }

    @Test
    void garbageInputsAreRejectedRatherThanThrowing() {
        assertThat(PreviewAccessToken.isValid(SECRET, HOSTNAME, null, NOW)).isFalse();
        assertThat(PreviewAccessToken.isValid(SECRET, HOSTNAME, "", NOW)).isFalse();
        assertThat(PreviewAccessToken.isValid(SECRET, HOSTNAME, "not-a-token-at-all", NOW)).isFalse();
        assertThat(PreviewAccessToken.isValid(SECRET, HOSTNAME, "notanumber.abc123", NOW)).isFalse();
    }
}
