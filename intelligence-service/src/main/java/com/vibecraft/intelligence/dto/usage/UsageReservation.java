package com.vibecraft.intelligence.dto.usage;

import java.time.LocalDate;

/**
 * A conservative slice of a user's daily token budget, claimed atomically before an AI call starts and trued up once
 * its real cost is known.
 *
 * <p>Handles: carrying the day and amount reserved so reconciliation adjusts the exact row it claimed from, even if
 * the call runs past midnight, and the user id, captured once on the request thread, since reconciliation can run
 * later - on a stream's completion, or a background scheduler - where there is no signed-in caller of its own.
 *
 * <p>A zero-token reservation means the plan is unlimited: nothing was claimed, and reconciling it is a no-op.
 */
public record UsageReservation(Long userId, LocalDate date, int tokens) {
}
