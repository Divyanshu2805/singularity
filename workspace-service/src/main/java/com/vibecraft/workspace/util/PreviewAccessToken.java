package com.vibecraft.workspace.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

/**
 * Mints and verifies the short-lived token appended to a preview's URL (CODE_REVIEW.md SEC-06).
 *
 * <p>Handles: signing a hostname plus an expiry with HMAC-SHA256, and verifying that signature and expiry back on
 * the same two inputs. The token is self-contained - the proxy needs no session store or database to check it, only
 * the same shared secret this class signs with.
 *
 * <p>Without this, a preview's hostname is a bare, unauthenticated, permanent bearer link: anyone who ever saw it
 * keeps working access to the running app forever, including a project member who was since removed. Minting only
 * happens from {@code PreviewDeploymentServiceImpl}'s already-{@code @PreAuthorize}-guarded methods, so only someone
 * who currently has view access ever receives a valid token, and it stops working - independent of whether anyone
 * remembers to revoke anything - once {@code preview.access-token-ttl} elapses. This is a bound on residual access
 * after removal, not instant revocation: proxy/index.js verifies the token itself, statelessly, on every request, so
 * there is nothing to push a revocation to.
 *
 * <p>The Node proxy (proxy/index.js) re-implements this exact scheme with Node's built-in crypto module - the two
 * must stay byte-for-byte identical (same message format, same hex encoding) or every token fails to verify.
 */
public final class PreviewAccessToken {

    private PreviewAccessToken() {
    }

    public static String mint(String secret, String hostname, Instant now, Duration validFor) {
        long expiresAt = now.plus(validFor).getEpochSecond();
        return expiresAt + "." + sign(secret, message(hostname, expiresAt));
    }

    public static boolean isValid(String secret, String hostname, String token, Instant now) {
        if (token == null || hostname == null) {
            return false;
        }
        int separator = token.indexOf('.');
        if (separator < 0) {
            return false;
        }
        long expiresAt;
        try {
            expiresAt = Long.parseLong(token.substring(0, separator));
        } catch (NumberFormatException e) {
            return false;
        }
        if (now.getEpochSecond() > expiresAt) {
            return false;
        }
        String expectedSignature = sign(secret, message(hostname, expiresAt));
        return constantTimeEquals(expectedSignature, token.substring(separator + 1));
    }

    private static String message(String hostname, long expiresAt) {
        return hostname + "." + expiresAt;
    }

    private static String sign(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 must always be available", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }
}
