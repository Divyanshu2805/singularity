package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.usage.UsageEventPage;
import com.vibecraft.intelligence.dto.usage.UsageInsightsResponse;

/**
 * Where a user's tokens went - read from the ledger and reconciled against the daily quota counter.
 *
 * <p>Handles: the breakdown for a range, the paginated activity list, and the CSV export.
 *
 * <p>Kept apart from the usage service on purpose: that one sits on every AI request's hot path, and aggregation over
 * weeks of history has no business next to it. Every method is about the caller's own usage, resolved from the
 * session rather than from a parameter.
 */
public interface UsageInsightsService {

    UsageInsightsResponse getInsights(String range);

    UsageEventPage getRecentEvents(int page, int size);

    String exportCsv(String range);
}
