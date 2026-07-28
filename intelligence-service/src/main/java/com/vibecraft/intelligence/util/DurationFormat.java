package com.vibecraft.intelligence.util;

/**
 * How long a turn took, written the way a person reads a clock rather than as a raw second count.
 *
 * <p>Handles: seconds, minutes with seconds, and hours with minutes - never zero, since a turn always took some time.
 *
 * <p>A real multi-file build runs for minutes, and a raw second count makes the reader do the division. The frontend
 * formats the same turn the same way until the saved event arrives; keep the two in step.
 */
public final class DurationFormat {

    private DurationFormat() {
    }

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
