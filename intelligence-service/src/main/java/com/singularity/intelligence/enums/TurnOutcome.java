package com.singularity.intelligence.enums;

/**
 * How a build turn ended, as the turn's own record and the chat both read it.
 *
 * <p>Handles: naming each ending - the turn's files were saved; it answered without changing anything; it saved what
 * it wrote but did not finish what it planned; it wrote changes that could not be saved; the model returned nothing;
 * the call failed; someone stopped it; the daily allowance ran out part-way, with whatever was finished saved - and
 * saying which of those leave the request worth sending again.
 *
 * <p>Stored as the name, on the turn's first event, so a conversation reloaded tomorrow still knows which turns to
 * offer a retry on. The column has no check constraint, so adding a value needs no migration.
 */
public enum TurnOutcome {
    SAVED,
    ANSWERED,
    INCOMPLETE,
    NOT_SAVED,
    EMPTY,
    FAILED,
    STOPPED,
    OUT_OF_BUDGET;

    public boolean isWorthRetrying() {
        return this != SAVED && this != ANSWERED;
    }
}
