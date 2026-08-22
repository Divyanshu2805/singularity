package com.vibecraft.workspace.util;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * The content-addressing scheme every blob key and revision entry uses.
 *
 * <p>Handles: hashing a file's bytes to the hex string that is both its blob object key (under
 * {@code blob/<hash>} in the project-blobs bucket) and its identity for dedup and rollback. SHA-256 is a JDK-standard
 * algorithm - no dependency needed - and collision-infeasible for this use.
 */
public final class ContentHash {

    private ContentHash() {
    }

    public static String sha256Hex(byte[] content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(content));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is a JDK-guaranteed algorithm", e);
        }
    }
}
