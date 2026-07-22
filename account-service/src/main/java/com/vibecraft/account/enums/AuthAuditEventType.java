package com.vibecraft.account.enums;

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

    /** The events a signed-in client may report about changes it made directly with Firebase. */
    public boolean isClientReportable() {
        return this == MFA_ENROLLED || this == MFA_REMOVED || this == PASSWORD_CHANGED;
    }
}
