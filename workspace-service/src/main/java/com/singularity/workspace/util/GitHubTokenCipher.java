package com.singularity.workspace.util;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * Keeps a stored GitHub token unreadable at rest, and proves that a sign-in coming back from GitHub is the one this
 * service started for this person.
 *
 * <p>Handles: encrypting and decrypting a token with AES-256-GCM under the configured key, with a fresh nonce each
 * time; and making and checking the {@code state} value of an OAuth sign-in - the user's id, when it runs out and a
 * random part, signed with a key derived from the same secret.
 *
 * <p>The state is what stops someone finishing a sign-in in another person's session: GitHub hands it back unchanged,
 * and it is accepted only if its signature is ours, it has not run out, and the id inside it is the id of whoever is
 * signed in now. Nothing is stored for it, so there is nothing to clean up after a sign-in that was abandoned.
 *
 * <p>The key must be 32 bytes, given in base64. Anything else stops the service at start-up, since a short key would
 * be padded or refused somewhere less obvious later. The signing key is not the encryption key itself but an HMAC of
 * a fixed label under it, so the two uses can never be played against each other.
 */
public final class GitHubTokenCipher {

    private static final int KEY_BYTES = 32;
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int STATE_RANDOM_BYTES = 12;

    private final SecretKeySpec encryptionKey;
    private final SecretKeySpec signingKey;
    private final SecureRandom random = new SecureRandom();

    public GitHubTokenCipher(String base64Key) {
        byte[] key;
        try {
            key = Base64.getDecoder().decode(base64Key.strip());
        } catch (RuntimeException e) {
            throw new IllegalStateException("GITHUB_TOKEN_KEY must be 32 bytes in base64 (for example: openssl rand -base64 32).");
        }
        if (key.length != KEY_BYTES) {
            throw new IllegalStateException("GITHUB_TOKEN_KEY must be 32 bytes in base64 (for example: openssl rand -base64 32).");
        }
        this.encryptionKey = new SecretKeySpec(key, "AES");
        this.signingKey = new SecretKeySpec(hmac(new SecretKeySpec(key, "HmacSHA256"), "github-oauth-state".getBytes(StandardCharsets.UTF_8)), "HmacSHA256");
    }

    public String encrypt(String token) {
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey, new GCMParameterSpec(TAG_BITS, nonce));
            byte[] sealed = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + sealed.length).put(nonce).put(sealed).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Couldn't encrypt a GitHub token", e);
        }
    }

    public String decrypt(String stored) {
        try {
            byte[] bytes = Base64.getDecoder().decode(stored);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey, new GCMParameterSpec(TAG_BITS, bytes, 0, NONCE_BYTES));
            return new String(cipher.doFinal(bytes, NONCE_BYTES, bytes.length - NONCE_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | RuntimeException e) {
            throw new IllegalStateException("A stored GitHub token could not be read with the configured key", e);
        }
    }

    public String newState(long userId, Instant now, Duration ttl) {
        byte[] nonce = new byte[STATE_RANDOM_BYTES];
        random.nextBytes(nonce);
        String payload = userId + "." + now.plus(ttl).getEpochSecond() + "." + url(nonce);
        return payload + "." + url(hmac(signingKey, payload.getBytes(StandardCharsets.UTF_8)));
    }

    public boolean isStateFor(String state, long userId, Instant now) {
        if (state == null || state.length() > 200) {
            return false;
        }
        int cut = state.lastIndexOf('.');
        if (cut <= 0) {
            return false;
        }
        String payload = state.substring(0, cut);
        byte[] expected = hmac(signingKey, payload.getBytes(StandardCharsets.UTF_8));
        byte[] given;
        try {
            given = Base64.getUrlDecoder().decode(state.substring(cut + 1));
        } catch (IllegalArgumentException e) {
            return false;
        }
        if (!MessageDigest.isEqual(expected, given)) {
            return false;
        }
        String[] parts = payload.split("\\.");
        if (parts.length != 3) {
            return false;
        }
        try {
            return Long.parseLong(parts[0]) == userId && now.getEpochSecond() <= Long.parseLong(parts[1]);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private static String url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] hmac(SecretKeySpec key, byte[] message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return mac.doFinal(message);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC-SHA256 is unavailable", e);
        }
    }
}
