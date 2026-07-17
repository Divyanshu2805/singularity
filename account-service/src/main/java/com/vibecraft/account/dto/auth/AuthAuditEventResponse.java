package com.vibecraft.account.dto.auth;

import com.vibecraft.account.enums.AuthAuditEventType;

import java.time.Instant;

public record AuthAuditEventResponse(
        Long id,
        AuthAuditEventType type,
        String ipAddress,
        String userAgent,
        String detail,
        Instant createdAt
) {
}
