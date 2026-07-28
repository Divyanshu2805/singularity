package com.vibecraft.common.dto;

/**
 * What account-service tells the other services when a session ends.
 *
 * <p>Handles: carrying exactly one of two things to POST /internal/v1/sessions/evict - a cookieHash for one
 * signed-out session, or a firebaseUid for "sign out everywhere" (every cached session of that user). The receiving
 * service drops the matching entries from its own in-process session cache instead of trusting them until they
 * expire.
 */
public record EvictSessionRequest(String cookieHash, String firebaseUid) {

    public static EvictSessionRequest ofSession(String cookieHash) {
        return new EvictSessionRequest(cookieHash, null);
    }

    public static EvictSessionRequest ofUser(String firebaseUid) {
        return new EvictSessionRequest(null, firebaseUid);
    }
}
