package com.vibecraft.intelligence.dto.usage;

/**
 * A single day and its total.
 *
 * <p>Handles: the pair the insights page uses for the peak day.
 */
public record DayUsage(String date, long totalTokens) {
}
