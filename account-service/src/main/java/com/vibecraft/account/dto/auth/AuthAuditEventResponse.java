package com.vibecraft.account.dto.auth;

import com.vibecraft.account.enums.AuthAuditEventType;

import java.time.Instant;

/**
 * One entry in the account security trail, as the settings page shows it.
 *
 * <p>Handles: the event type, where it came from, any detail recorded with it, and when it happened.
 */
public record AuthAuditEventResponse(
        Long id,
        AuthAuditEventType type,
        String ipAddress,
        String userAgent,
        String detail,
        Instant createdAt
) {
}
