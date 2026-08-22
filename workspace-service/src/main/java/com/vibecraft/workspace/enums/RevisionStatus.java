package com.vibecraft.workspace.enums;

/**
 * A revision's lifecycle state.
 *
 * <p>Handles: distinguishing a durably-recorded manifest that hasn't finished applying yet (STAGING) from one that
 * landed (APPLIED), one whose apply/rollback ran and left the project on its previous revision (FAILED), and one
 * that lost an optimistic-concurrency race against a concurrent publish (CONFLICT).
 */
public enum RevisionStatus {
    STAGING,
    APPLIED,
    FAILED,
    CONFLICT
}
