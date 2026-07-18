package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.usage.UsageEventPage;
import com.vibecraft.intelligence.dto.usage.UsageInsightsResponse;

/**
 * Where a user's tokens went - read from the usage ledger, reconciled against the daily quota counter.
 *
 * <p>Kept apart from {@link UsageService} on purpose: that one sits on every AI request's hot path (the budget
 * check and the write), and aggregation over weeks of history has no business being next to it.
 *
 * <p>Every method is about the caller's own usage only, resolved from the session, never from a parameter.
 */
public interface UsageInsightsService {

    /** {@code range} is "today", "7d", "30d" or "90d"; anything else is a 400. */
    UsageInsightsResponse getInsights(String range);

    UsageEventPage getRecentEvents(int page, int size);

    /** The window's calls as CSV, newest first. */
    String exportCsv(String range);
}
