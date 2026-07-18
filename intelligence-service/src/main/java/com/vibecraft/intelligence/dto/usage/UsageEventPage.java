package com.vibecraft.intelligence.dto.usage;

import java.util.List;

public record UsageEventPage(List<UsageEventResponse> events, int page, int size, boolean hasMore) {
}
