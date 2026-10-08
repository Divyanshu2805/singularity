package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.service.impl.BudgetHolds.Hold;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the in-memory record of what calls in progress are holding of users' daily allowances.
 *
 * <p>Handles: adding up what one user's calls hold and what they are estimated to have spent, keeping users apart, a
 * closed hold counting for nothing, an unlimited plan's hold never taking room, and a hold nobody closed being
 * forgotten - without that last one a call that died without settling would keep its share of the allowance out of
 * reach until the service restarted.
 */
class BudgetHoldsTest {

    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-01-01T10:00:00Z"));
    private final Clock clock = new Clock() {
        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    };
    private final BudgetHolds holds = new BudgetHolds(clock);

    @Test
    void whatAUsersCallsHoldAndHaveSpentSoFarIsAddedUpPerUser() {
        Hold build = holds.open(7L, 60_000, 100_000, false, 60_000);
        Hold lens = holds.open(7L, 12_000, 100_000, false, 12_000);
        holds.open(8L, 60_000, 100_000, false, 40_000);
        build.inFlight = 9_000;
        lens.inFlight = 500;

        assertThat(holds.heldFor(7L)).isEqualTo(72_000);
        assertThat(holds.inFlightFor(7L)).isEqualTo(9_500);
        assertThat(holds.heldFor(8L)).isEqualTo(40_000);
        assertThat(holds.heldFor(9L)).isZero();
    }

    @Test
    void aClosedHoldHoldsNothingAndCanNoLongerBeFound() {
        Hold hold = holds.open(7L, 60_000, 100_000, false, 60_000);

        holds.close(hold.id);

        assertThat(holds.heldFor(7L)).isZero();
        assertThat(holds.find(hold.id)).isNull();
        assertThat(holds.find(0)).isNull();
    }

    @Test
    void anUnlimitedPlansHoldTakesNoRoomButItsSpendIsStillCounted() {
        Hold hold = holds.open(7L, 60_000, Integer.MAX_VALUE, true, 60_000);
        hold.inFlight = 4_000;

        assertThat(holds.heldFor(7L)).isZero();
        assertThat(holds.inFlightFor(7L)).isEqualTo(4_000);
    }

    @Test
    void aHoldNobodyClosedIsForgottenRatherThanKeepingItsRoomForGood() {
        Hold abandoned = holds.open(7L, 60_000, 100_000, false, 60_000);
        now.set(now.get().plus(BudgetHolds.ABANDONED_AFTER).plusSeconds(1));
        Hold fresh = holds.open(7L, 12_000, 100_000, false, 12_000);

        assertThat(holds.heldFor(7L)).isEqualTo(12_000);
        assertThat(holds.find(abandoned.id)).isNull();
        assertThat(holds.find(fresh.id)).isNotNull();
    }

    @Test
    void everyUserHasOneLockOfTheirOwn() {
        assertThat(holds.lockFor(7L)).isSameAs(holds.lockFor(7L)).isNotSameAs(holds.lockFor(8L));
    }
}
