package com.java.vibecraft.enums;

public enum AuthAuditEventType {
    ACCOUNT_CREATED,
    ACCOUNT_LINKED,
    SIGN_IN,
    SIGN_IN_REJECTED,
    SIGN_OUT,
    SIGN_OUT_EVERYWHERE,
    MFA_ENROLLED,
    MFA_REMOVED,
    PASSWORD_CHANGED,

    /**
     * Historical only, as of the legacy-auth removal - nothing writes these anymore (the legacy Bearer
     * signup/login/password-reset endpoints are gone). Kept so existing {@code auth_audit_events} rows with
     * these values still deserialize instead of throwing on read (e.g. {@code GET /api/auth/security-events}
     * for an account old enough to have one).
     */
    LEGACY_SIGN_UP,
    LEGACY_SIGN_IN,
    LEGACY_PASSWORD_RESET_REQUESTED,
    LEGACY_PASSWORD_RESET_COMPLETED;

    /** The events a signed-in client may report about changes it made directly with Firebase. */
    public boolean isClientReportable() {
        return this == MFA_ENROLLED || this == MFA_REMOVED || this == PASSWORD_CHANGED;
    }
}
