package com.java.vibecraft.dto.usage;

/** A single day and its total - used for the peak day. */
public record DayUsage(String date, long totalTokens) {
}
