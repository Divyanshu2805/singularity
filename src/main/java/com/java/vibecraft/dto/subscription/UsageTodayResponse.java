package com.java.vibecraft.dto.subscription;

import java.time.Instant;

/**
 * Everything the UI needs to answer "how much have I got left?" in one call - tokens for today, projects
 * against the plan's ceiling, and when the daily allowance refills.
 *
 * <p>{@code resetsAt} is computed server-side on purpose: the day a {@code UsageLog} row belongs to is
 * {@code LocalDate.now()} in the <em>server's</em> zone (forced to Asia/Kolkata in
 * {@code VibecraftApplication.main}), so a browser working it out from its own midnight would count down to
 * the wrong moment for anyone in another timezone.
 */
public record UsageTodayResponse(
        Integer tokensUsed,
        Integer tokensLimit,
        Integer previewsRunning,
        Integer previewsLimit,
        Integer projectsUsed,
        Integer projectsLimit,
        /** The instant the token allowance refills - the next midnight in the server's zone. */
        Instant resetsAt,
        String planName,
        /** Today's tokens on the project asked about, or null when no project was given. */
        Long projectTokensToday,
        /** The caller's most recent AI call - the chat meter's "last reply" line. Null before their first. */
        com.java.vibecraft.dto.usage.LastRequestUsage lastRequest
) {
}
