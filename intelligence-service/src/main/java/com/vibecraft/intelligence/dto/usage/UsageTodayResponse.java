package com.vibecraft.intelligence.dto.usage;

import java.time.Instant;

/**
 * Everything the UI needs to answer "how much have I got left?" in one call.
 *
 * <p>Handles: today's tokens against the plan's ceiling, previews running and projects owned against theirs, the
 * plan's name, today's tokens on one project when one was asked about, the caller's last call, and when the daily
 * allowance refills.
 *
 * <p>The reset instant is computed server-side on purpose: the day a usage row belongs to is decided in the server's
 * zone, so a browser working it out from its own midnight would count down to the wrong moment for anyone elsewhere.
 * The two counts come from workspace-service, which owns the rows; the allowances come from account-service.
 */
public record UsageTodayResponse(
        Integer tokensUsed,
        Integer tokensLimit,
        Integer previewsRunning,
        Integer previewsLimit,
        Integer projectsUsed,
        Integer projectsLimit,
        Instant resetsAt,
        String planName,
        Long projectTokensToday,
        LastRequestUsage lastRequest
) {
}
