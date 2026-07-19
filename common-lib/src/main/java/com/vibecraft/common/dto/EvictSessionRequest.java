package com.vibecraft.common.dto;

/**
 * What account-service tells the other services when a session ends, so they drop it from their own in-process
 * session caches right away instead of trusting it until its cache entry expires. Exactly one field is set:
 * {@code cookieHash} for one signed-out session, {@code firebaseUid} for "sign out everywhere" (every cached
 * session of that user). Sent to {@code POST /internal/v1/sessions/evict}.
 */
public record EvictSessionRequest(String cookieHash, String firebaseUid) {

    public static EvictSessionRequest ofSession(String cookieHash) {
        return new EvictSessionRequest(cookieHash, null);
    }

    public static EvictSessionRequest ofUser(String firebaseUid) {
        return new EvictSessionRequest(null, firebaseUid);
    }
}
