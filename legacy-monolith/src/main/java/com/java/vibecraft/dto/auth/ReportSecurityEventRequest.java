package com.java.vibecraft.dto.auth;

import com.java.vibecraft.enums.AuthAuditEventType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A change the browser made directly with Firebase (a second factor added or removed, a password changed), reported
 * so it lands in the audit trail. The ID token must be fresh from that change and belong to the signed-in user.
 */
public record ReportSecurityEventRequest(

        @NotNull(message = "Event type is required")
        AuthAuditEventType type,

        @NotBlank(message = "ID token is required")
        @Size(max = 8192, message = "ID token is too long")
        String idToken
) {
}
