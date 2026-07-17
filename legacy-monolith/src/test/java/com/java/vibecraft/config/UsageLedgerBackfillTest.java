package com.java.vibecraft.config;

import com.java.vibecraft.entity.UsageEvent;
import com.java.vibecraft.enums.UsageFeature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** How existing chat history becomes ledger rows. */
class UsageLedgerBackfillTest {

    private static final Instant T1 = Instant.parse("2026-09-15T10:00:00Z");
    private static final Instant T2 = Instant.parse("2026-09-15T10:00:30Z");

    private static Object[] msg(long user, long project, String role, Integer tokens, Instant at) {
        return new Object[]{user, project, role, tokens, at};
    }

    @Test
    @DisplayName("turns a user turn and its reply into one build, at the reply's time")
    void pairsATurn() {
        List<UsageEvent> events = UsageLedgerBackfill.pairTurns(List.of(
                msg(1, 7, "USER", 1_200, T1),
                msg(1, 7, "ASSISTANT", 4_800, T2)));

        assertThat(events).hasSize(1);
        UsageEvent event = events.get(0);
        assertThat(event.feature()).isEqualTo(UsageFeature.BUILD);
        assertThat(event.getInputTokens()).isEqualTo(1_200);
        assertThat(event.getOutputTokens()).isEqualTo(4_800);
        assertThat(event.getTotalTokens()).isEqualTo(6_000);
        assertThat(event.getProjectId()).isEqualTo(7);
        // The reply's real time, not the moment the backfill ran - or every past build lands on one day.
        assertThat(event.getCreatedAt()).isEqualTo(T2);
    }

    @Test
    @DisplayName("counts nothing for a user turn that never got a reply")
    void unansweredTurn() {
        List<UsageEvent> events = UsageLedgerBackfill.pairTurns(List.of(
                msg(1, 7, "USER", 1_200, T1),
                msg(1, 7, "USER", 900, T1),
                msg(1, 7, "ASSISTANT", 100, T2)));

        // Only the second user turn was answered; the first opened and was superseded.
        assertThat(events).hasSize(1);
        assertThat(events.get(0).getInputTokens()).isEqualTo(900);
    }

    @Test
    @DisplayName("never pairs a reply with a turn from another chat")
    void doesNotCrossChats() {
        List<UsageEvent> events = UsageLedgerBackfill.pairTurns(List.of(
                msg(1, 7, "USER", 1_200, T1),
                msg(2, 8, "ASSISTANT", 500, T2)));

        assertThat(events).hasSize(1);
        assertThat(events.get(0).getInputTokens()).isZero();
        assertThat(events.get(0).getUserId()).isEqualTo(2);
    }

    @Test
    @DisplayName("skips turns that recorded no tokens at all")
    void skipsEmptyTurns() {
        assertThat(UsageLedgerBackfill.pairTurns(List.of(
                msg(1, 7, "USER", null, T1),
                msg(1, 7, "ASSISTANT", null, T2)))).isEmpty();
    }
}
