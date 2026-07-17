package com.java.vibecraft.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Mirrored by {@code formatWorkedFor} in the frontend's {@code lib/utils.ts} - the browser shows its own
 * measurement in this same shape until the saved event lands, so the two must not drift.
 */
class DurationFormatTest {

    @Test
    @DisplayName("under a minute stays in seconds")
    void secondsOnly() {
        assertThat(DurationFormat.worked(1)).isEqualTo("1s");
        assertThat(DurationFormat.worked(45)).isEqualTo("45s");
        assertThat(DurationFormat.worked(59)).isEqualTo("59s");
    }

    @Test
    @DisplayName("a real multi-file build reads as minutes and seconds, not a raw count")
    void minutesAndSeconds() {
        assertThat(DurationFormat.worked(60)).isEqualTo("1m");
        assertThat(DurationFormat.worked(104)).isEqualTo("1m 44s");
        assertThat(DurationFormat.worked(220)).isEqualTo("3m 40s");
    }

    @Test
    @DisplayName("a whole number of minutes drops the trailing 0s")
    void wholeMinutes() {
        assertThat(DurationFormat.worked(240)).isEqualTo("4m");
        assertThat(DurationFormat.worked(1800)).isEqualTo("30m");
    }

    @Test
    @DisplayName("past an hour it rounds to minutes - nobody needs the seconds by then")
    void hours() {
        assertThat(DurationFormat.worked(3600)).isEqualTo("1h");
        assertThat(DurationFormat.worked(3720)).isEqualTo("1h 2m");
        assertThat(DurationFormat.worked(7380)).isEqualTo("2h 3m");
    }

    @Test
    @DisplayName("a turn always took some time, so zero and negatives never surface")
    void neverZero() {
        assertThat(DurationFormat.worked(0)).isEqualTo("1s");
        assertThat(DurationFormat.worked(-5)).isEqualTo("1s");
    }
}
