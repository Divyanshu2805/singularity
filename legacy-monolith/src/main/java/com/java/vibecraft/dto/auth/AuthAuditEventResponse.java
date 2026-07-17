package com.java.vibecraft.dto.auth;

import com.java.vibecraft.enums.AuthAuditEventType;

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
