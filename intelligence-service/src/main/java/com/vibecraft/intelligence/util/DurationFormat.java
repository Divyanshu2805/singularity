package com.vibecraft.intelligence.util;

/**
 * How long a turn took, written the way a person reads a clock rather than as a raw second count.
 *
 * <p>A real multi-file build runs for minutes, and "Thought for 220s" makes the reader do the division
 * themselves. Mirrored by {@code formatWorkedFor} in the frontend's {@code lib/utils.ts}, which the browser
 * uses for the same turn until the saved event arrives - keep the two in step.
 */
public final class DurationFormat {

    private DurationFormat() {
    }

    /** e.g. {@code 45s}, {@code 3m 40s}, {@code 4m}, {@code 1h 2m}. Never zero - a turn always took some time. */
    public static String worked(long seconds) {
        long total = Math.max(1, seconds);

        if (total < 60) {
            return total + "s";
        }

        long minutes = total / 60;
        long remainingSeconds = total % 60;

        if (minutes < 60) {
            return remainingSeconds == 0 ? minutes + "m" : minutes + "m " + remainingSeconds + "s";
        }

        long hours = minutes / 60;
        long remainingMinutes = minutes % 60;
        return remainingMinutes == 0 ? hours + "h" : hours + "h " + remainingMinutes + "m";
    }
}
