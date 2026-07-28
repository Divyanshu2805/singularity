package com.vibecraft.common.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * SHA-256 as lowercase hex.
 *
 * <p>Handles: hashing a high-entropy secret - a session cookie - so it can be looked up by value without being
 * stored. Never for passwords, which need a slow salted hash instead.
 */
public final class Hashing {

    private Hashing() {
    }

    public static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }
}
