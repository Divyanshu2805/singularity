package com.vibecraft.account.dto.auth;

import com.vibecraft.account.enums.AuthAuditEventType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A change the browser made directly with Firebase, reported so it lands in the audit trail.
 *
 * <p>Handles: the event type - only the client-reportable ones are accepted - and an ID token that must be fresh from
 * that change and belong to the signed-in user, which is what stops a client writing arbitrary history.
 */
public record ReportSecurityEventRequest(

        @NotNull(message = "Event type is required")
        AuthAuditEventType type,

        @NotBlank(message = "ID token is required")
        @Size(max = 8192, message = "ID token is too long")
        String idToken
) {
}
