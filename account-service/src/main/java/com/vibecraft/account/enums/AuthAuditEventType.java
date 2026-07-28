package com.vibecraft.account.enums;

/**
 * The kinds of entry the account security trail records.
 *
 * <p>Handles: naming each event, and deciding which of them a signed-in client is allowed to report about changes it
 * made directly with Firebase - a second factor added or removed, or a password changed. Everything else is recorded
 * by the server only.
 */
public enum AuthAuditEventType {
    ACCOUNT_CREATED,
    ACCOUNT_LINKED,
    SIGN_IN,
    SIGN_IN_REJECTED,
    SIGN_OUT,
    SIGN_OUT_EVERYWHERE,
    MFA_ENROLLED,
    MFA_REMOVED,
    PASSWORD_CHANGED;

    public boolean isClientReportable() {
        return this == MFA_ENROLLED || this == MFA_REMOVED || this == PASSWORD_CHANGED;
    }
}
