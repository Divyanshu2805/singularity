package com.singularity.intelligence.dto.usage;

import java.time.LocalDate;

/**
 * A hold on part of a user's daily token allowance, taken before an AI call starts and given back when it ends.
 *
 * <p>Handles: carrying the user id, captured once on the request thread, since the call is settled later - on a
 * stream's completion or a build turn's own thread - where there is no signed-in caller; the day it was taken; how
 * many tokens were granted at the start; and the id of the hold itself, which is what the budget is tracked by while
 * the call runs.
 *
 * <p>A hold is not spending. It keeps other calls of the same user from claiming the same room, and it is never part
 * of the figure the usage meter shows. It used to be added to the day's counter as if it were spent - sixty thousand
 * tokens the moment a build began, taken back when the first call ended - which is why the meter jumped at the start
 * of every build and fell on the next refresh.
 *
 * <p>A hold id of zero is a reservation nothing is tracking, which is what a test builds by hand.
 */
public record UsageReservation(Long userId, LocalDate date, int tokens, long holdId) {

    public UsageReservation(Long userId, LocalDate date, int tokens) {
        this(userId, date, tokens, 0L);
    }
}
