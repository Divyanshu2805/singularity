package com.vibecraft.intelligence.dto.usage;

import java.util.List;

/**
 * One page of the usage activity list.
 *
 * <p>Handles: the events, the page and size asked for, and whether there is another page - which is resolved by
 * asking for one row more than the page needs, not by a second count query.
 */
public record UsageEventPage(List<UsageEventResponse> events, int page, int size, boolean hasMore) {
}
